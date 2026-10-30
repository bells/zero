import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BundledPluginSettingsProps } from '../../core/pluginHost/pluginModule';
import { policySaveFeedback } from './caffeineState';
import type { AwakeBatteryPolicy, AwakeBatteryPolicyUpdate, AwakePowerSnapshot, AwakePreferences } from './caffeineState';
import { createCaffeineTranslator } from './i18n';
import './caffeine.css';

const defaults: AwakeBatteryPolicy = {
  stop_on_low_battery: false,
  threshold_percent: 10,
  stop_on_low_power_mode: false,
};

export function AwakeSettings({ language, enabled }: BundledPluginSettingsProps) {
  const t = createCaffeineTranslator(language);
  const [policy, setPolicy] = useState(defaults);
  const [power, setPower] = useState<AwakePowerSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<'error' | 'saved' | 'stop_failed' | null>(null);
  const live = useRef(true);
  const operation = useRef(false);

  const read = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const [prefs, state] = await Promise.all([
        invoke<AwakePreferences>('get_awake_preferences'),
        invoke<AwakePowerSnapshot>('get_awake_power_state'),
      ]);
      if (live.current) {
        setPolicy(prefs.battery_policy);
        setPower(state);
        setReady(true);
        setFeedback(null);
      }
    } catch {
      if (live.current) setFeedback('error');
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };

  useEffect(() => {
    live.current = true;
    void read();
    return () => { live.current = false; };
  }, []);

  const save = async () => {
    if (operation.current || !ready || !enabled) return;
    operation.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await invoke<AwakeBatteryPolicyUpdate>('update_awake_battery_policy', { policy });
      if (live.current) {
        setPolicy(result.policy);
        setFeedback(policySaveFeedback(result));
      }
    } catch {
      if (live.current) setFeedback('error');
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };

  const noBattery = power?.battery === 'no_battery';
  const thresholdUnavailable = !ready || noBattery || power?.battery === 'unsupported';
  const modeUnavailable = !ready || noBattery || power?.low_power_mode_capability === 'unsupported';
  const thresholdDisabled = busy || !enabled || thresholdUnavailable || !policy.stop_on_low_battery;
  return (
    <section className="preferences-section awake-battery-settings" aria-busy={busy} aria-labelledby="awake-battery-heading">
      <div className="preferences-section-heading">
        <h3 id="awake-battery-heading">{t('caffeine.battery.title')}</h3>
        <p>{t('caffeine.battery.description')}</p>
      </div>
      <div className="preferences-settings-group">
        <div className="preferences-setting-row" id="preference-setting-tool-zero-awake-battery-threshold" tabIndex={-1}>
          <div className="preferences-setting-copy">
            <label htmlFor="awake-battery-threshold-toggle">{t('caffeine.battery.threshold')}</label>
          </div>
          <input id="awake-battery-threshold-toggle" type="checkbox" role="switch" checked={policy.stop_on_low_battery}
            disabled={busy || !enabled || thresholdUnavailable}
            onChange={event => { setPolicy({ ...policy, stop_on_low_battery: event.currentTarget.checked }); setFeedback(null); }} />
        </div>
        <div className="awake-battery-threshold" data-disabled={thresholdDisabled}>
          <div className="awake-battery-threshold-heading">
            <label htmlFor="awake-battery-percent">{t('caffeine.battery.thresholdLabel')}</label>
            <output htmlFor="awake-battery-percent">{policy.threshold_percent}%</output>
          </div>
          <input id="awake-battery-percent" type="range" min="10" max="90" step="5"
            aria-valuetext={`${policy.threshold_percent}%`} value={policy.threshold_percent} disabled={thresholdDisabled}
            onChange={event => { setPolicy({ ...policy, threshold_percent: Number(event.currentTarget.value) }); setFeedback(null); }} />
        </div>
        <div className="preferences-setting-row" id="preference-setting-tool-zero-awake-battery-low-power" tabIndex={-1}>
          <div className="preferences-setting-copy">
            <label htmlFor="awake-low-power-toggle">{t('caffeine.battery.mode')}</label>
          </div>
          <input id="awake-low-power-toggle" type="checkbox" role="switch" checked={policy.stop_on_low_power_mode}
            disabled={busy || !enabled || modeUnavailable}
            onChange={event => { setPolicy({ ...policy, stop_on_low_power_mode: event.currentTarget.checked }); setFeedback(null); }} />
        </div>
      </div>
      <p className="awake-battery-note">{t('caffeine.battery.override')}</p>
      <div className="awake-power-state">
        {noBattery ? <p>{t('caffeine.battery.noBattery')}</p> : <>
          {(power?.battery === 'unsupported' || power?.low_power_mode_capability === 'unsupported') && <p>{t('caffeine.battery.unsupported')}</p>}
          {(!power || power.source === 'unknown' || power.battery_percent === null || power.low_power_mode === null) && <p role="status">{t('caffeine.battery.unknown')}</p>}
          {power?.battery_percent !== null && power?.battery_percent !== undefined && <p>{t('caffeine.battery.percent')}: {power.battery_percent}%</p>}
        </>}
      </div>
      <div className="awake-settings-actions">
        {feedback && <p className={`awake-settings-feedback preferences-feedback ${feedback === 'saved' ? 'saved' : 'error'}`}
          role={feedback === 'saved' ? 'status' : 'alert'}>
          {t(feedback === 'error' ? 'caffeine.battery.error' : feedback === 'stop_failed' ? 'caffeine.battery.stopFailed' : 'caffeine.battery.saved')}
        </p>}
        <button type="button" className="awake-secondary" aria-disabled={busy} onClick={() => { void read(); }}>{t('caffeine.battery.retry')}</button>
        <button type="button" className="awake-primary" disabled={!ready || !enabled} aria-disabled={busy} onClick={() => { void save(); }}>{t('caffeine.battery.save')}</button>
      </div>
    </section>
  );
}
