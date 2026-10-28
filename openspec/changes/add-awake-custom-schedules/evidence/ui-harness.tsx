// Development-only harness. This tests rendered UI; it never invokes native IPC.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { CaffeinePanel } from '/src/plugins/caffeine/CaffeinePanel';
import { AwakeSettings } from '/src/plugins/caffeine/AwakeSettings';
import { createCaffeineTranslator } from '/src/plugins/caffeine/i18n';
import type { AwakePreferences, CaffeineSchedule, CaffeineSnapshot } from '/src/plugins/caffeine/caffeineState';
import '/src/App.css';
import '/src/appShell/navigation.css';
mockWindows('main');
let snapshot:CaffeineSnapshot={enabled:false,started_at_ms:null,expires_at_ms:null,duration_minutes:null,schedule:null,elapsed_ms:null,remaining_ms:null,message:'',action_error:null,battery_threshold_overridden:false,protection_unavailable:false,last_stop_reason:null};
let prefs:AwakePreferences={version:1,custom_input:null,battery_policy:{stop_on_low_battery:false,threshold_percent:10,stop_on_low_power_mode:false}};
let began=performance.now();
let mutations=0;
mockIPC((cmd,args)=>{
  if(cmd==='get_surface_activity')return{label:'main',state:'active'};
  if(cmd==='get_caffeine_state'){
    const elapsed=snapshot.enabled?performance.now()-began:null;
    return{...snapshot,elapsed_ms:elapsed,remaining_ms:snapshot.schedule?.kind==='duration'?Math.max(0,snapshot.schedule.minutes*60000-(elapsed??0)):snapshot.schedule?.kind==='until'?Math.max(0,snapshot.schedule.expires_at_ms-Date.now()):null};
  }
  if(cmd==='get_awake_preferences')return prefs;
  if(cmd==='get_awake_power_state')return{source:'external',battery:'supported',battery_percent:75,low_power_mode_capability:'supported',low_power_mode:false};
  if(cmd==='update_awake_battery_policy'){
    prefs={...prefs,battery_policy:args.policy as AwakePreferences['battery_policy']};
    return{policy:prefs.battery_policy,session:snapshot};
  }
  if(cmd==='set_caffeine_schedule'||cmd==='toggle_keep_awake'){
    mutations++;
    const schedule:CaffeineSchedule=cmd==='set_caffeine_schedule'?args.schedule as CaffeineSchedule:args.enabled?(args.durationMinutes===null?{kind:'unlimited'}:{kind:'duration',minutes:Number(args.durationMinutes)}):{kind:'unlimited'};
    const enabled=cmd==='set_caffeine_schedule'||args.enabled===true;
    snapshot={...snapshot,enabled,started_at_ms:enabled?Date.now():null,schedule:enabled?schedule:null,duration_minutes:enabled&&schedule.kind==='duration'?schedule.minutes:null,expires_at_ms:enabled&&schedule.kind==='until'?schedule.expires_at_ms:enabled&&schedule.kind==='duration'?Date.now()+schedule.minutes*60000:null};
    if(args.input)prefs={...prefs,custom_input:args.input as AwakePreferences['custom_input']};
    began=performance.now();
    document.getElementById('ipc-log')!.textContent=`Native mutations (mock): ${mutations}`;
    return snapshot;
  }
  return null;
},{shouldMockEvents:true});
function Harness(){
  const [language,setLanguage]=useState<'zh-CN'|'en-US'>('zh-CN');
  const [size,setSize]=useState('920x660');
  const [settings,setSettings]=useState(false);
  const [revision,setRevision]=useState<number|undefined>();
  const [width,height]=size.split('x').map(Number);
  const tray=size==='400x500';
  return <><div style={{padding:10,display:'flex',gap:12,flexWrap:'wrap'}}>
    <label>Language <select value={language} onChange={e=>setLanguage(e.currentTarget.value as 'zh-CN'|'en-US')}><option>zh-CN</option><option>en-US</option></select></label>
    <label>Size <select value={size} onChange={e=>setSize(e.currentTarget.value)}><option>920x660</option><option>760x520</option><option>400x500</option></select></label>
    <label>Preferences <input type="checkbox" checked={settings} onChange={e=>setSettings(e.currentTarget.checked)}/></label>
    <button onClick={()=>setRevision((revision??0)+1)}>Custom intent</button><span id="ipc-log">Native mutations (mock): 0</span>
  </div><main className={`app-shell ${tray?'tray-shell':'main-window-shell'}`} style={{width,height}}>
    <header style={{minHeight:44}}>Zero · mocked IPC verification</header>
    {tray&&<nav style={{minHeight:36}}>Snap · Awake · Paper · Launch · File</nav>}
    {settings?<div style={{overflow:'auto',padding:16}}><AwakeSettings language={language} enabled/></div>:tray?<div className="tray-plugin-content"><CaffeinePanel language={language} t={createCaffeineTranslator(language)} editorRevision={revision}/></div>:<div className="main-window-layout"><aside className="main-sidebar">Zero Awake</aside><section className="main-workspace"><CaffeinePanel language={language} t={createCaffeineTranslator(language)} editorRevision={revision}/></section></div>}
    {tray&&<footer style={{minHeight:44}}>主窗口　偏好设置　关于</footer>}
  </main></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
