import type { ImageSettings, ImageOutput, ImageJobIdentity, WatermarkPosition, ImageErrorCode } from '../../lib/web-tools/image-contracts';
import { parseImageMessage } from '../../lib/web-tools/image-contracts';
import { createImageBatch, replaceImageSources, changeImageSettings, clearImageBatch, startImageBatch, nextImageJob, cancelImageBatch, acceptImageMessage, currentImageResults } from '../../lib/web-tools/image-batch';
import { imagePolicy, defaultImageSettings } from '../../lib/web-tools/image-policy';
import { inspectImageInput } from '../../lib/web-tools/image-input';
import { validateImageSettings } from '../../lib/web-tools/image-settings';
import { safeOriginalImageName, previewLongEdge } from './image-ui-policy';
import { ImageWorkerSession } from './image-worker-session';
import { imageDownloadNames } from '../../lib/web-tools/image-names';

export function initImageWorkspace(root: HTMLElement, locale: 'zh' | 'en'): void {
 const host=root.querySelector<HTMLElement>('[data-image-workspace]'); if(!host)return;
 const t=(zh:string,en:string)=>locale==='zh'?zh:en;
 const el=<T extends HTMLElement>(name:string)=>host.querySelector<T>(`[data-image-${name}]`)!;
 const input=(name:string)=>el<HTMLInputElement>(name);
 const value=(name:string)=>el<HTMLInputElement|HTMLSelectElement>(name).value;
 const operation=root.dataset.tool==='image-watermark'?'watermark':root.dataset.tool==='image-compressor'?'compress':'convert';
 let state=createImageBatch(defaultImageSettings(operation));
 const files=new Map<string,File>(); const metadata=new Map<string,string>();
 const transientURLs=new Set<string>();
 const results=new Map<string,{output:ImageOutput;url:string}>();
 let worker:Worker|null=null, timer:ReturnType<typeof setTimeout>|undefined;
 let archive:Worker|null=null, archiveTimer:ReturnType<typeof setTimeout>|undefined;
 const previewSession=new ImageWorkerSession(()=>new Worker(new URL('./image-worker.ts',import.meta.url),{type:'module'}));
 let selectedPreview:string|null=null, previewDebounce:ReturnType<typeof setTimeout>|undefined;
 let importing=false;
 let importRevision=0, previewRevision=0, previewURL:string|null=null, disposed=false;
 const status=(text:string)=>{el('status').textContent=text;};
 const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);};
 const stopArchive=()=>{archive?.terminate();archive=null;clearTimeout(archiveTimer);el('zip-cancel').hidden=true;};
 const clearPreview=()=>{previewRevision++;previewSession.cancel();clearTimeout(previewDebounce);if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;el('preview').hidden=true;el('preview').querySelector('img')?.removeAttribute('src');};
 const discard=()=>{stopArchive();clearPreview();for(const url of transientURLs)URL.revokeObjectURL(url);transientURLs.clear();for(const item of results.values())URL.revokeObjectURL(item.url);results.clear();};
 function settings():ImageSettings {
  const output={format:value('format') as ImageSettings['output']['format'],quality:Number(value('quality')),maxLongEdge:value('edge')===''?null:Number(value('edge')),jpegBackground:value('background')};
  if(operation!=='watermark')return {operation,output};
  const common={text:value('text'),fontRatio:Number(value('font'))/100,color:value('color'),opacity:Number(value('opacity'))/100,rotation:Number(value('rotation')),marginRatio:Number(value('margin'))/100};
  return {operation,output,watermark:value('mode')==='tile'?{...common,mode:'tile',spacingRatio:Number(value('spacing'))/100}:{...common,mode:'single',position:value('position') as WatermarkPosition}};
 }
 function errorText(code:ImageErrorCode):string {
  const errors:Record<ImageErrorCode,[string,string]>={unsupported:['不支持的图片或动画','Unsupported image or animation'],invalid:['图片或参数无效','Invalid image or settings'],limit:['超过资源限制','Resource limit exceeded'],timeout:['处理超时','Processing timed out'],cancelled:['已取消','Cancelled'],decode:['无法解码图片','Image decoding failed'],encode:['无法编码图片','Image encoding failed'],resource:['资源不可用','Resources unavailable'],download:['下载失败','Download failed'],worker:['图片 Worker 不可用','Image worker unavailable'],archive:['ZIP 打包失败','ZIP archive failed']};
  return t(...errors[code]);
 }
 const bytes=(n:number)=>`${(n/1024).toFixed(1)} KiB`;
 function preview(id:string){
  if(importing||state.mode==='running')return;
  selectedPreview=null;clearPreview();const entry=results.get(id);if(!entry)return;
  const generation=previewRevision,batchRevision=state.revision;
  const active=()=>generation===previewRevision&&batchRevision===state.revision&&!disposed&&state.mode!=='running';
  const maxLongEdge=previewLongEdge(entry.output.width,entry.output.height,imagePolicy.previewPixels,null);
  const previewSettings:ImageSettings={operation:'convert',output:{format:'png',quality:75,maxLongEdge,jpegBackground:'#ffffff'}};
  // Transfer a copy: the retained successful output still owns its downloadable bytes.
  const buffer=entry.output.bytes.slice(0);
  status(t('正在生成结果缩略图…','Generating result thumbnail…'));
  previewSession.start({kind:'process',jobId:generation+1,batchRevision,itemId:id,settings:previewSettings,policy:imagePolicy,bytes:buffer},message=>{
   if(!active())return;
   if(message.kind==='error'){status(errorText(message.code));return;}
   if(message.kind!=='result')return;
   const output=message.output;
   if(output.width*output.height>imagePolicy.previewPixels||output.byteLength>imagePolicy.maxResultBytes){status(errorText('limit'));return;}
   previewURL=URL.createObjectURL(new Blob([output.bytes],{type:output.mime}));
   el('preview').querySelector('img')!.src=previewURL;el('preview').hidden=false;
   el('preview').querySelector('figcaption')!.textContent=t('实际处理结果的有界缩略图；最终尺寸以结果数据为准。','Bounded thumbnail of the processed result; see result details for final dimensions.');
   status(t('结果缩略图已更新。','Result thumbnail updated.'));
  },code=>{if(active())status(errorText(code));});
 }
 async function sourcePreview(id:string){
  if(importing||state.mode==='running')return;selectedPreview=id;clearPreview();const generation=previewRevision;const batchRevision=state.revision;const file=files.get(id);if(!file)return;
  const valid=validateImageSettings(settings());if(!valid.ok){status(errorText(valid.error.code));return;}status(t('正在生成选中图片的缩略预览…','Generating a thumbnail of the selected image…'));
  const active=()=>generation===previewRevision&&selectedPreview===id&&batchRevision===state.revision&&!disposed&&state.mode!=='running';
  try{const buffer=await file.arrayBuffer();if(!active())return;const inspected=inspectImageInput(new Uint8Array(buffer));if(!inspected.ok){status(errorText(inspected.error.code));return;}
   const {width,height}=inspected.value;const edge=previewLongEdge(width,height,imagePolicy.previewPixels,valid.value.output.maxLongEdge);const chosen=valid.value.output.maxLongEdge;const bounded={...valid.value,output:{...valid.value.output,maxLongEdge:chosen===null?edge:Math.min(chosen,edge)}};
   previewSession.start({kind:'process',jobId:generation+1,batchRevision,itemId:id,settings:bounded,policy:imagePolicy,bytes:buffer},message=>{if(!active())return;if(message.kind==='error'){status(errorText(message.code));return;}if(message.kind!=='result')return;const output=message.output;if(output.width*output.height>imagePolicy.previewPixels||output.byteLength>imagePolicy.maxResultBytes){status(errorText('limit'));return;}previewURL=URL.createObjectURL(new Blob([output.bytes],{type:output.mime}));el('preview').querySelector('img')!.src=previewURL;el('preview').hidden=false;status(t('当前设置的缩略预览已更新。','Thumbnail updated for current settings.'));el('preview').querySelector('figcaption')!.textContent=t('当前设置的缩略预览（最多 40 万像素）；最终尺寸和字号以处理结果为准。','Current settings at thumbnail size (up to 400,000 pixels); final size and text rendering follow the processed result.');},code=>{if(active())status(errorText(code));});
  }catch{if(active())status(errorText('worker'));}
 }
 function schedulePreview(){if(!selectedPreview)return;clearTimeout(previewDebounce);previewDebounce=setTimeout(()=>{if(selectedPreview)void sourcePreview(selectedPreview);},250);}
 const statuses:Record<string,string>={queued:t('等待处理','Queued'),cancelled:t('已取消','Cancelled'),probing:t('检查图片','Inspecting'),decoding:t('解码中','Decoding'),transforming:t('变换中','Transforming'),encoding:t('编码中','Encoding'),success:t('已完成','Complete')};
 function render(){
  el('counts').textContent=t(`成功 ${currentImageResults(state).length} · 失败 ${state.items.filter(i=>i.status==='failed').length} · 取消 ${state.items.filter(i=>i.status==='cancelled').length} · 总计 ${state.items.length}`,`${currentImageResults(state).length} successful · ${state.items.filter(i=>i.status==='failed').length} failed · ${state.items.filter(i=>i.status==='cancelled').length} cancelled · ${state.items.length} total`);
  const container=el('results');container.replaceChildren();const successes=currentImageResults(state);const names=imageDownloadNames(successes.map(i=>files.get(i.itemId)?.name??'image'),operation,successes.map(i=>i.result.output.format));
  for(const item of state.items){const file=files.get(item.itemId);if(!file)continue;const card=document.createElement('article');card.className='wi-result';card.dataset.imageItem=item.itemId;const heading=document.createElement('h3');heading.textContent=file.name;card.append(heading);const detail=document.createElement('p');detail.textContent=`${metadata.get(item.itemId)??'—'} · ${bytes(file.size)} · ${item.status==='failed'?errorText(item.error):statuses[item.status]}`;card.append(detail);
   const links=document.createElement('div');links.className='wi-links';
   const original=document.createElement('button');original.type='button';original.dataset.imageOriginal='';original.textContent=t('下载原文件（保留元数据）','Download original (metadata retained)');original.onclick=()=>{const url=URL.createObjectURL(file);transientURLs.add(url);download(url,safeOriginalImageName(file.name));setTimeout(()=>URL.revokeObjectURL(url),60000);};links.append(original);const sourceButton=document.createElement('button');sourceButton.type='button';sourceButton.dataset.imageSourcePreview='';sourceButton.textContent=t('预览当前设置','Preview current settings');sourceButton.disabled=importing||state.mode==='running';sourceButton.onclick=()=>void sourcePreview(item.itemId);links.append(sourceButton);
   const result=results.get(item.itemId);if(item.status==='success'&&result){const o=result.output;const p=document.createElement('p');const delta=((o.byteLength-file.size)/file.size*100);p.textContent=`${o.format.toUpperCase()} · ${o.width} × ${o.height} · ${bytes(o.byteLength)} · ${delta>=0?'+':''}${delta.toFixed(1)}%${delta>=0?t('（无体积收益）',' (no size benefit)'):''}`;card.append(p);const a=document.createElement('a');a.dataset.imageDownload='';a.href=result.url;a.download=names[successes.findIndex(i=>i.itemId===item.itemId)]??'image';a.textContent=t('下载结果','Download result');links.append(a);const b=document.createElement('button');b.type='button';b.disabled=importing||state.mode==='running';b.textContent=t('预览结果','Preview result');b.onclick=()=>void preview(item.itemId);links.append(b);}
   card.append(links);container.append(card);
  }
  el<HTMLButtonElement>('run').disabled=importing||state.mode==='running'||!files.size;
  el<HTMLButtonElement>('retry').disabled=importing||state.mode==='running'||!state.items.some(i=>i.status==='failed');
  el<HTMLButtonElement>('cancel').disabled=state.mode!=='running';el<HTMLButtonElement>('zip').disabled=!!archive||!successes.length;
  el('quality-label').hidden=value('format')==='png'||(value('format')==='preserve'&&state.items.length>0&&state.items.every(i=>i.format==='png'));el('background-label').hidden=value('format')!=='jpeg'&&value('format')!=='preserve';
  if(operation==='watermark'){el('position-label').hidden=value('mode')==='tile';el('spacing-label').hidden=value('mode')!=='tile';}
 }
 function download(url:string,name:string){const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
 function finish(identity:ImageJobIdentity,code:ImageErrorCode){state=acceptImageMessage(state,{kind:'error',...identity,code});stop();render();void next();}
 async function next(){
  const selected=nextImageJob(state);if(!selected.ok)return;state=selected.value.state;const job=selected.value.job;if(!job){status(t(`已完成 ${currentImageResults(state).length} / ${state.items.length} 张；失败 ${state.items.filter(i=>i.status==='failed').length} 张。`,`${currentImageResults(state).length} / ${state.items.length} complete; ${state.items.filter(i=>i.status==='failed').length} failed.`));render();return;}render();
  const active=()=>state.active?.jobId===job.jobId&&state.revision===job.batchRevision;
  try{const file=files.get(job.itemId);if(!file)throw new Error();const buffer=await file.arrayBuffer();if(!active())return;
   worker=new Worker(new URL('./image-worker.ts',import.meta.url),{type:'module'});timer=setTimeout(()=>{if(active())finish(job,'timeout');},imagePolicy.timeoutMs);
   worker.onerror=()=>{if(active())finish(job,'worker');};worker.onmessage=(event:MessageEvent<unknown>)=>{if(!active())return;const message=parseImageMessage(event.data);if(!message){finish(job,'worker');return;}const previous=state;let accepted=acceptImageMessage(state,message);if(accepted===previous)return;
    if(message.kind==='result'){const total=[...results.values()].reduce((sum,r)=>sum+r.output.byteLength,0);if(message.output.width>imagePolicy.maxEdge||message.output.height>imagePolicy.maxEdge||message.output.width*message.output.height>imagePolicy.maxPixels||message.output.byteLength>imagePolicy.maxResultBytes||total+message.output.byteLength>imagePolicy.maxBatchResultBytes){finish(job,'limit');return;}const url=URL.createObjectURL(new Blob([message.output.bytes],{type:message.output.mime}));results.set(job.itemId,{output:message.output,url});}
    state=accepted;render();if(message.kind!=='progress'){stop();void next();}
   };worker.postMessage({kind:'process',...job,settings:state.settings,policy:imagePolicy,bytes:buffer},[buffer]);
  }catch{if(active())finish(job,'worker');}
 }
 async function importFiles(){
  const selected=Array.from(input('files').files??[]);input('files').value='';
  if(selected.length>imagePolicy.maxBatchItems||selected.reduce((n,f)=>n+f.size,0)>imagePolicy.maxBatchSourceBytes||selected.some(f=>!f.size||f.size>imagePolicy.maxSourceBytes)){status(errorText('limit'));return;}
  if(!selected.length)return;
  const revision=++importRevision;importing=true;stop();state=cancelImageBatch(state);clearPreview();render();
  try {
  const sources=[];const importedFiles=new Map<string,File>();const importedMetadata=new Map<string,string>();
  for(const [index,file]of selected.entries()){
   try{const buffer=await file.arrayBuffer();if(revision!==importRevision||disposed)return;const inspected=inspectImageInput(new Uint8Array(buffer));
    if(!inspected.ok&&inspected.error.code==='limit'){status(errorText('limit'));return;}
    const id=`image-${revision}-${index}`;importedFiles.set(id,file);
    if(inspected.ok){const info=inspected.value;importedMetadata.set(id,`${info.format.toUpperCase()} · ${info.width} × ${info.height}${t('（源文件尺寸）',' (source dimensions)')}`);sources.push({itemId:id,sourceBytes:file.size,format:info.format});}
    else{importedMetadata.set(id,t('待处理时验证','Validation during processing'));sources.push({itemId:id,sourceBytes:file.size,format:null});}
   }catch{if(revision!==importRevision||disposed)return;status(errorText('invalid'));return;}
  }
  if(revision!==importRevision||disposed)return;
  stop();state=cancelImageBatch(state);const replaced=replaceImageSources(state,sources);if(!replaced.ok){status(errorText(replaced.error.code));return;}
  selectedPreview=null;discard();files.clear();metadata.clear();
  for(const [id,file]of importedFiles)files.set(id,file);for(const [id,info]of importedMetadata)metadata.set(id,info);
  state=replaced.value;status(t(`已选择 ${files.size} 张；点击处理开始。`,`${files.size} selected; process to begin.`));render();
  } finally { if(revision===importRevision){importing=false;render();} }
 }
 input('files').addEventListener('change',()=>void importFiles());
 el('settings').addEventListener('input',()=>{stop();discard();const changed=changeImageSettings(state,settings());if(changed.ok)state=changed.value;status(t('设置已更改，请重新处理。','Settings changed. Process again.'));render();schedulePreview();});
 function run(failed=false){if(importing)return;clearPreview();const validated=validateImageSettings(settings());if(!validated.ok){status(errorText(validated.error.code));return;}const started=startImageBatch(state,failed?'failed':'pending');if(started.ok){state=started.value;status(t('正在本地处理…','Processing locally…'));void next();}}
 el('run').onclick=()=>run();el('retry').onclick=()=>run(true);el('cancel').onclick=()=>{stop();state=cancelImageBatch(state);status(t('已取消；已完成结果仍可下载。','Cancelled; completed results remain available.'));render();};
 function clear(){++importRevision;importing=false;selectedPreview=null;stop();discard();files.clear();metadata.clear();const nextState=clearImageBatch(state);if(nextState.ok)state=nextState.value;input('files').value='';status('');render();}
 el('clear').onclick=clear;
 el('zip-cancel').onclick=()=>{stopArchive();status(t('已取消 ZIP。','ZIP cancelled.'));render();};
 el('zip').onclick=()=>{const successful=currentImageResults(state);const names=imageDownloadNames(successful.map(i=>files.get(i.itemId)?.name??'image'),operation,successful.map(i=>i.result.output.format));const total=successful.reduce((n,i)=>n+(results.get(i.itemId)?.output.byteLength??0),0);if(!successful.length||total+successful.length*1024>imagePolicy.maxZipBytes){status(errorText('limit'));return;}status(t(`正在打包 ${successful.length} 个成功项；失败 ${state.items.filter(i=>i.status==='failed').length} 项。`, `Archiving ${successful.length} successful items; ${state.items.filter(i=>i.status==='failed').length} failed.`));const revision=state.revision;try{archive=new Worker(new URL('./image-archive-worker.ts',import.meta.url),{type:'module'});const currentArchive=archive;el('zip-cancel').hidden=false;render();archiveTimer=setTimeout(()=>{stopArchive();status(errorText('timeout'));render();},imagePolicy.zipTimeoutMs);archive.onerror=()=>{stopArchive();status(errorText('archive'));render();};archive.onmessage=(event:MessageEvent<unknown>)=>{if(archive!==currentArchive||revision!==state.revision)return;const data=event.data;if(!(data instanceof ArrayBuffer)||data.byteLength>imagePolicy.maxZipBytes){stopArchive();status(errorText('archive'));render();return;}const url=URL.createObjectURL(new Blob([data],{type:'application/zip'}));transientURLs.add(url);download(url,`zero-${operation}.zip`);setTimeout(()=>URL.revokeObjectURL(url),60000);stopArchive();status(t(`ZIP 已生成，包含 ${successful.length} 个成功项；失败 ${state.items.filter(i=>i.status==='failed').length} 项未打包。`,`ZIP ready: ${successful.length} successful items; ${state.items.filter(i=>i.status==='failed').length} failed items excluded.`));render();};archive.postMessage(successful.map((i,index)=>({name:names[index],bytes:results.get(i.itemId)!.output.bytes})));}catch{stopArchive();status(errorText('archive'));render();}};
 window.addEventListener('pagehide',()=>{disposed=true;clear();});window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;clear();}});
 window.addEventListener('beforeunload',event=>{if(state.mode==='running'||archive){event.preventDefault();}});
 const initial=changeImageSettings(state,settings());if(initial.ok)state=initial.value;
 render();
}
