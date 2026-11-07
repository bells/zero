import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import {loadConfigFromFile} from 'vite';

test('full-profile dev server optimizes conversion libraries before a hidden job imports them',async()=>{
 const original=process.env.ZERO_BUILD_PROFILE;
 try{
  process.env.ZERO_BUILD_PROFILE='full';
  const loaded=await loadConfigFromFile({command:'serve',mode:'development'},path.resolve('vite.config.ts'));
  assert.deepEqual(loaded.config.optimizeDeps?.entries,['index.html']);
  for(const dependency of ['pdfjs-dist','docx','docx-preview','lucide-react','@tauri-apps/api/core','@tauri-apps/api/event','@tauri-apps/api/window','react-dom/client'])assert.ok(loaded.config.optimizeDeps?.include?.includes(dependency),`${dependency} must be ready before engine jobs start`);
 }finally{if(original===undefined)delete process.env.ZERO_BUILD_PROFILE;else process.env.ZERO_BUILD_PROFILE=original;}
});
test('hidden engine page reload revokes active jobs instead of waiting for their deadline',()=>{
 const source=fs.readFileSync('src-tauri/src/services/file/engine_bridge.rs','utf8');
 assert.match(source,/\.on_page_load\([\s\S]*?PageLoadEvent::Started[\s\S]*?fail_all_sessions\(/);
});
test('hidden engine remains scheduled while a native OCR result is pending',()=>{
 const source=fs.readFileSync('src-tauri/src/services/file/engine_bridge.rs','utf8');
 assert.match(source,/\.title\("Zero File Engine"\)[\s\S]*?\.background_throttling\(\s*tauri::utils::config::BackgroundThrottlingPolicy::Disabled\s*,?\s*\)/);
});
test('profiles excluding File do not prebundle its conversion libraries',async()=>{
 const original=process.env.ZERO_BUILD_PROFILE;
 try{
  process.env.ZERO_BUILD_PROFILE='standard';
  const loaded=await loadConfigFromFile({command:'serve',mode:'development'},path.resolve('vite.config.ts'));
  for(const dependency of ['pdfjs-dist','docx','docx-preview'])assert.ok(!loaded.config.optimizeDeps?.include?.includes(dependency));
 }finally{if(original===undefined)delete process.env.ZERO_BUILD_PROFILE;else process.env.ZERO_BUILD_PROFILE=original;}
});
