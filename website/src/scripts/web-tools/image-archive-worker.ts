import { zipSync } from 'fflate';
self.onmessage=(event:MessageEvent<unknown>)=>{
 try{
  if(!Array.isArray(event.data)||event.data.length<1||event.data.length>10)throw new Error();
  const entries:Record<string,Uint8Array>=Object.create(null) as Record<string,Uint8Array>;let total=0;
  for(const item of event.data as unknown[]){if(typeof item!=='object'||item===null)throw new Error();const entry=item as Record<string,unknown>;if(typeof entry.name!=='string'||entry.name.length>240||/[\\/\x00-\x1f]/.test(entry.name)||entry.name==='..'||!(entry.bytes instanceof ArrayBuffer)||Object.hasOwn(entries,entry.name))throw new Error();total+=entry.bytes.byteLength+1024;if(total>32*1024*1024)throw new Error();entries[entry.name]=new Uint8Array(entry.bytes);}
  const zipped=zipSync(entries,{level:0});if(zipped.byteLength>32*1024*1024)throw new Error();const bytes=zipped.slice().buffer;self.postMessage(bytes,{transfer:[bytes]});
 }catch{self.postMessage(null);}
};
