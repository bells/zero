import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {buildPluginPackage} from '../../../scripts/plugin-packages/build.mjs';
const root=path.resolve('src/plugins/caffeine/package');
const sdkRoot=path.resolve('src/sdk');
test('Awake owned policy preserves preferences, limits and local calendar/DST behavior',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zero-awake-domain-'));
  try {
    const code=ts.transpileModule(await fs.readFile(path.join(root,'domain.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2020}}).outputText;
    await fs.writeFile(path.join(temp,'domain.mjs'),code);
    const domain=await import(pathToFileURL(path.join(temp,'domain.mjs')));
    assert.equal(domain.PREFERENCE_KEY,'awake.preferences.v1');
    assert.deepEqual(domain.readPreferences(null),domain.defaultPreferences);
    for(const minutes of [1,60,1440])assert.deepEqual(domain.durationSchedule(minutes),{kind:'duration',minutes});
    for(const minutes of [0,1.5,1441,NaN])assert.throws(()=>domain.durationSchedule(minutes));
    for(const threshold of [9,11,91])assert.throws(()=>domain.readPreferences({...domain.defaultPreferences,battery_policy:{...domain.defaultPreferences.battery_policy,threshold_percent:threshold}}));
    const value={version:1,custom_input:{mode:'until',duration_minutes:60,hour:1,minute:30},battery_policy:{stop_on_low_battery:true,threshold_percent:25,stop_on_low_power_mode:true}};
    assert.deepEqual(domain.preferenceValue(domain.readPreferences(value)),value);
    assert.deepEqual(domain.taskConditions(value,true),{batteryThresholdPercent:25,stopOnLowPowerMode:true,allowLowBatteryStart:true});
    const previous=process.env.TZ;
    try {
      process.env.TZ='America/New_York';
      assert.equal(domain.resolveUntil(1,30,Date.parse('2026-11-01T01:45:00-04:00')),Date.parse('2026-11-01T01:30:00-05:00'));
      assert.equal(domain.resolveUntil(2,30,Date.parse('2026-03-08T01:00:00-05:00')),Date.parse('2026-03-08T03:30:00-04:00'));
      assert.throws(()=>domain.resolveUntil(25,0,Date.now()));
    }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('Awake builds deterministic SDK-only archives and rejects a private host import',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zero-awake-package-'));
  try {
    const first=await buildPluginPackage({pluginRoot:root,sdkRoot,outputDir:path.join(temp,'one')});
    const second=await buildPluginPackage({pluginRoot:root,sdkRoot,outputDir:path.join(temp,'two')});
    assert.equal(first.sha256,second.sha256);
    assert.equal(first.manifest.id,'zero.awake');
    assert.equal(first.manifest.version,'0.1.0');
    assert.equal(first.manifest.background,undefined);
    assert.deepEqual(first.manifest.platforms,['macos','windows']);
    assert(first.sourceFiles.some(file=>file.endsWith('/@types/react-dom/client.d.ts')));
    assert(first.sourceFiles.some(file=>file.endsWith('/@types/react/index.d.ts')));
    assert(first.files.includes('manifest.json'));
    assert(first.files.includes('index.html'));
    assert(!first.files.some(file=>/screenshot|wallpaper|launcher|file-engine|tauri/i.test(file)));
    assert(first.sourceFiles.every(file=>file.startsWith(root+path.sep)||file.startsWith(sdkRoot+path.sep)||file.includes(`${path.sep}node_modules${path.sep}`)));
    const bad=path.join(temp,'bad');
    await fs.cp(root,bad,{recursive:true,filter:file=>!file.includes(`${path.sep}node_modules`)});
    await fs.symlink(path.resolve('node_modules'),path.join(bad,'node_modules'),'dir');
    await fs.appendFile(path.join(bad,'entry.tsx'),`\nimport type {PluginRecord} from ${JSON.stringify(path.resolve('src/core/pluginHost/contracts.ts'))};\n`);
    await assert.rejects(buildPluginPackage({pluginRoot:bad,sdkRoot,outputDir:path.join(temp,'rejected')}),/boundary|Unresolved/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
