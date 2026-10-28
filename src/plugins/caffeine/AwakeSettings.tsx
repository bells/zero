import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BundledPluginSettingsProps } from '../../core/pluginHost/pluginModule';
import { policySaveFeedback } from './caffeineState';
import type { AwakeBatteryPolicy, AwakeBatteryPolicyUpdate, AwakePowerSnapshot, AwakePreferences } from './caffeineState';
import { createCaffeineTranslator } from './i18n';
import './caffeine.css';

const defaults:AwakeBatteryPolicy={stop_on_low_battery:false,threshold_percent:10,stop_on_low_power_mode:false};
export function AwakeSettings({language,enabled}:BundledPluginSettingsProps){
  const t=createCaffeineTranslator(language);
  const [policy,setPolicy]=useState(defaults);
  const [power,setPower]=useState<AwakePowerSnapshot|null>(null);
  const [busy,setBusy]=useState(true);
  const [ready,setReady]=useState(false);
  const [feedback,setFeedback]=useState<'error'|'saved'|'stop_failed'|null>(null);
  const live=useRef(true),operation=useRef(false);
  const read=async()=>{
    if(operation.current)return;
    operation.current=true;setBusy(true);
    try{
      const [prefs,state]=await Promise.all([invoke<AwakePreferences>('get_awake_preferences'),invoke<AwakePowerSnapshot>('get_awake_power_state')]);
      if(live.current){setPolicy(prefs.battery_policy);setPower(state);setReady(true);setFeedback(null);}
    }catch{if(live.current)setFeedback('error');}
    finally{operation.current=false;if(live.current)setBusy(false);}
  };
  useEffect(()=>{live.current=true;void read();return()=>{live.current=false;};},[]);
  const save=async()=>{
    if(operation.current||!ready||!enabled)return;
    operation.current=true;setBusy(true);setFeedback(null);
    try{
      const result=await invoke<AwakeBatteryPolicyUpdate>('update_awake_battery_policy',{policy});
      if(live.current){setPolicy(result.policy);setFeedback(policySaveFeedback(result));}
    }catch{if(live.current)setFeedback('error');}
    finally{operation.current=false;if(live.current)setBusy(false);}
  };
  const noBattery=power?.battery==='no_battery';
  const thresholdUnavailable=!ready||noBattery||power?.battery==='unsupported';
  const modeUnavailable=!ready||noBattery||power?.low_power_mode_capability==='unsupported';
  return <section className="awake-battery-settings" aria-busy={busy} aria-labelledby="awake-battery-heading">
    <h3 id="awake-battery-heading">{t('caffeine.battery.title')}</h3>
    <p>{t('caffeine.battery.description')}</p>
    <div className="awake-battery-row" id="preference-setting-tool-zero-awake-battery-threshold" tabIndex={-1}>
      <label htmlFor="awake-battery-threshold-toggle">{t('caffeine.battery.threshold')}</label>
      <input id="awake-battery-threshold-toggle" type="checkbox" role="switch" checked={policy.stop_on_low_battery} disabled={busy||!enabled||thresholdUnavailable} onChange={e=>{setPolicy({...policy,stop_on_low_battery:e.currentTarget.checked});setFeedback(null);}}/>
    </div>
    <label htmlFor="awake-battery-percent">{t('caffeine.battery.thresholdLabel')} <strong>{policy.threshold_percent}%</strong></label>
    <div className="awake-battery-threshold"><input id="awake-battery-percent" type="range" min="10" max="90" step="5" aria-valuetext={`${policy.threshold_percent}%`} value={policy.threshold_percent} disabled={busy||!enabled||thresholdUnavailable||!policy.stop_on_low_battery} onChange={e=>{setPolicy({...policy,threshold_percent:Number(e.currentTarget.value)});setFeedback(null);}}/><output htmlFor="awake-battery-percent">{policy.threshold_percent}%</output></div>
    <div className="awake-battery-row" id="preference-setting-tool-zero-awake-battery-low-power" tabIndex={-1}>
      <label htmlFor="awake-low-power-toggle">{t('caffeine.battery.mode')}</label>
      <input id="awake-low-power-toggle" type="checkbox" role="switch" checked={policy.stop_on_low_power_mode} disabled={busy||!enabled||modeUnavailable} onChange={e=>{setPolicy({...policy,stop_on_low_power_mode:e.currentTarget.checked});setFeedback(null);}}/>
    </div>
    <p>{t('caffeine.battery.override')}</p>
    {noBattery ? <p>{t('caffeine.battery.noBattery')}</p> : <>
      {(power?.battery==='unsupported'||power?.low_power_mode_capability==='unsupported')&&<p>{t('caffeine.battery.unsupported')}</p>}
      {(!power||power.source==='unknown'||power.battery_percent===null||power.low_power_mode===null)&&<p role="status">{t('caffeine.battery.unknown')}</p>}
      {power?.battery_percent!==null&&power?.battery_percent!==undefined&&<p>{t('caffeine.battery.percent')}: {power.battery_percent}%</p>}
    </>}
    {feedback&&<p role={feedback==='saved'?'status':'alert'}>{t(feedback==='error'?'caffeine.battery.error':feedback==='stop_failed'?'caffeine.battery.stopFailed':'caffeine.battery.saved')}</p>}
    <div className="awake-custom-actions">
      <button type="button" aria-disabled={busy} onClick={()=>{void read();}}>{t('caffeine.battery.retry')}</button>
      <button type="button" disabled={!ready||!enabled} aria-disabled={busy} onClick={()=>{void save();}}>{t('caffeine.battery.save')}</button>
    </div>
  </section>;
}
