import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const require = createRequire(path.resolve('src/plugins/bingWallpaper/package/package.json'));
const {createElement} = require('react'); const {renderToStaticMarkup} = require('react-dom/server');
let view;
async function load(){
  if(!view)view=(async()=>{
    assert(await fs.access('src/plugins/bingWallpaper/package/PaperView.tsx').then(()=>true,()=>false),'Paper UI must render actual controller state');
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zero-paper-view-'));
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','src/plugins/bingWallpaper/package/PaperView.tsx','--strict','--noUncheckedIndexedAccess','--exactOptionalPropertyTypes','--target','ES2022','--module','ES2022','--moduleResolution','bundler','--lib','ES2022,DOM','--jsx','react-jsx','--skipLibCheck','--outDir',temp],{stdio:'pipe'});
    await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
    await fs.symlink(path.resolve('src/plugins/bingWallpaper/package/node_modules'),path.join(temp,'node_modules'));
    const value=await import(pathToFileURL(path.join(temp,'PaperView.js'))); await fs.rm(temp,{recursive:true,force:true}); return value;
  })();return view;
}
const selected={id:'photo',startDate:'20261116',publicationDate:'2026-11-16',title:'Mountain lake',attribution:'© Photographer',remoteUrl:'https://www.bing.com/th?id=Lake'};
const state={items:[selected],selected,canSelectOlder:false,canSelectNewer:false,preview:{leaseId:'lease',url:'blob:actual-photo',byteLength:10,width:2,height:2,mimeType:'image/jpeg'},previewLoading:false,loading:false,refreshing:false,stale:false,settingsLoaded:true,automation:{schemaVersion:1,settings:{version:1,autoChangeDaily:false},lastApplied:null,manualOverrideUntil:null,pendingIntent:null,recoveryIntent:null},platform:{platform:'test',supported:true},busy:null,scheduleStatus:'off',nextAtMs:null,uncertain:false,error:null,notice:null};
const actions={refresh(){},latest(){},selectOlder(){},selectNewer(){},apply(){},save(){},setAutoChangeDaily(){},recover(){}};
async function render(patch={},locale='en-US',surface='main'){const {PaperView}=await load();return renderToStaticMarkup(createElement(PaperView,{state:{...state,...patch},controller:actions,locale,surface}));}
test('workspace renders real selected image, attribution/date and named wallpaper actions',async()=>{
  const html=await render();assert.match(html,/<img[^>]+src="blob:actual-photo"/);assert.match(html,/Mountain lake/);assert.match(html,/© Photographer/);assert.match(html,/2026-11-16/);assert.match(html,/Set wallpaper/);assert.match(html,/Download/);assert.match(html,/role="switch"/);assert.doesNotMatch(html,/checked=""/);
});
test('uncertain outcome exposes explicit recovery and blocks apply without hiding download',async()=>{
  const html=await render({uncertain:true});assert.match(html,/Review wallpaper state/);assert.match(html,/previous wallpaper change/);assert.match(html,/<button[^>]*disabled=""[^>]*>Set wallpaper/);assert.match(html,/>Download<\/button>/);
});
test('saved enabled preference with scheduler failure is clearly distinct from running automation',async()=>{
  const html=await render({automation:{...state.automation,settings:{version:1,autoChangeDaily:true}},scheduleStatus:'failed'});assert.match(html,/checked=""/);assert.match(html,/Preference saved; scheduling failed/);assert.doesNotMatch(html,/Automatic changes scheduled/);
});
test('Chinese tray preserves compact surface and useful empty offline retry state without a fabricated image',async()=>{
  const html=await render({items:[],selected:null,preview:null,stale:true,error:{code:'paper.network'}},'zh-CN','tray');assert.match(html,/data-surface="tray"/);assert.match(html,/暂时没有可用壁纸/);assert.match(html,/重试/);assert.doesNotMatch(html,/<img/);
});
