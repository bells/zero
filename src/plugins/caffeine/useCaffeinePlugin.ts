import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSurfaceActivity } from "../../core/windowing/useSurfaceActivity";
import { type CaffeineDurationMinutes, formatDurationClock } from "./caffeineDuration";
import { createCaffeineRefresh, type AwakeCustomInput, type AwakePreferences, type CaffeineSchedule, type CaffeineSnapshot } from "./caffeineState";
import { startCaffeinePresentationClock } from "./caffeinePresentation";
import { confirmPreview, estimateTiming, parseDuration, resolveUntil } from "./caffeineSchedule";

export function useCaffeinePlugin() {
  const surfaceActivity = useSurfaceActivity();
  const [snapshot, setSnapshot] = useState<CaffeineSnapshot>({
    enabled: false, started_at_ms: null, duration_minutes: null, schedule:null,
    elapsed_ms:null, remaining_ms:null, battery_threshold_overridden:false,
    protection_unavailable:false,last_stop_reason:null,
    expires_at_ms: null, message: "", action_error: null,
  });
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busy = useRef(false);
  const [now, setNow] = useState(Date.now());
  const observedAt = useRef(performance.now());
  const [error, setError] = useState<string | null>(null);
  const [authoritativeSnapshotReady, setAuthoritativeSnapshotReady] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  const reader = useMemo(() => createCaffeineRefresh(
    () => invoke<CaffeineSnapshot>("get_caffeine_state"),
    (next) => {
      observedAt.current=performance.now();
      setSnapshot(next);
      if (next.enabled) setSelectedDurationMinutes(next.duration_minutes);
      setNow(Date.now()); setError(null); setAuthoritativeSnapshotReady(true);
    },
  ), []);
  const refresh = useCallback(async () => {
    try { await reader.refresh(); }
    catch (err: unknown) { if (active.current) setError(String(err)); }
  }, [reader]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const mutate = useCallback(async (command:string, input:Record<string,unknown>) => {
    if (busy.current || !authoritativeSnapshotReady) return false;
    busy.current=true; setIsBusy(true); reader.invalidate();
    let failure:string|null=null;
    try { await invoke<CaffeineSnapshot>(command,input); }
    catch (err:unknown) {failure=String(err);}
    finally {
      if (active.current) {await refresh();if(failure)setError(failure);}
      busy.current=false;
      if(mounted.current)setIsBusy(false);
    }
    return failure===null;
  }, [authoritativeSnapshotReady, reader, refresh]);
  const enable = useCallback(() => { void mutate("set_caffeine_schedule",{schedule:selectedDurationMinutes===null?{kind:"unlimited"}:{kind:"duration",minutes:selectedDurationMinutes}}); }, [selectedDurationMinutes, mutate]);
  const disable = useCallback(() => { void mutate("toggle_keep_awake",{enabled:false,durationMinutes:null}); }, [mutate]);
  const selectDuration = useCallback((duration:CaffeineDurationMinutes) => {
    if (busy.current || !authoritativeSnapshotReady) return;
    if (snapshot.enabled) void mutate("toggle_keep_awake",{enabled:true,durationMinutes:duration});
    else setSelectedDurationMinutes(duration);
  }, [authoritativeSnapshotReady, mutate, snapshot.enabled]);

  const [editorOpen,setEditorOpen]=useState(false);
  const hasDraft=useRef(false);
  const draftRevision=useRef(0);
  const [mode,setMode]=useState<"duration"|"until">("duration");
  const [hours,setHours]=useState("1"),[minutes,setMinutes]=useState("0");
  const [time,setTime]=useState("");
  const [preview,setPreview]=useState<number|null>(null);
  const [draftError,setDraftError]=useState<"invalid"|"expired"|"read"|null>(null);
  const [draftLoading,setDraftLoading]=useState(false);
  const setTimePreview=useCallback((value:string)=>{
    setTime(value);
    setDraftError(current=>current==="read"?current:null);
    const match=/^(\d{2}):(\d{2})$/.exec(value);
    try {setPreview(match?resolveUntil(Number(match[1]),Number(match[2]),Date.now()):null);}
    catch {setPreview(null);}
  },[]);
  const openEditor=useCallback(()=>{
    setEditorOpen(true);
    if(hasDraft.current)return;
    hasDraft.current=true;
    const revision=++draftRevision.current;
    setDraftLoading(true);setDraftError(null);setMode("duration");setHours("1");setMinutes("0");
    void invoke<AwakePreferences>("get_awake_preferences").then(prefs=>{
      if(!mounted.current||revision!==draftRevision.current)return;
      const saved=prefs.custom_input;
      const defaultTime=new Date(Date.now()+3600000);
      setMode(saved?.mode??"duration");
      setHours(String(Math.floor((saved?.duration_minutes??60)/60)));
      setMinutes(String((saved?.duration_minutes??60)%60));
      setTimePreview(`${String(saved?.hour??defaultTime.getHours()).padStart(2,"0")}:${String(saved?.minute??defaultTime.getMinutes()).padStart(2,"0")}`);
    }).catch(()=>{if(mounted.current&&revision===draftRevision.current){setDraftError("read");const later=new Date(Date.now()+3600000);setTimePreview(`${String(later.getHours()).padStart(2,"0")}:${String(later.getMinutes()).padStart(2,"0")}`);}})
      .finally(()=>{if(mounted.current&&revision===draftRevision.current)setDraftLoading(false);});
  },[setTimePreview]);
  const cancelEditor=useCallback(()=>{
    if(busy.current)return;
    draftRevision.current++;hasDraft.current=false;setEditorOpen(false);setDraftLoading(false);
  },[]);
  const applyCustom=useCallback(async()=>{
    if(busy.current||draftLoading)return;
    const total=parseDuration(hours,minutes);
    const [hour,minute]=time.split(":").map(Number);
    let schedule:CaffeineSchedule;
    if(mode==="duration"){
      if(total===null){setDraftError("invalid");return;}
      schedule={kind:"duration",minutes:total};
    }else{
      if(preview===null){setDraftError("invalid");return;}
      schedule={kind:"until",expires_at_ms:preview};
      if(!confirmPreview(schedule,Date.now())){setTimePreview(time);setDraftError("expired");return;}
    }
    const input:AwakeCustomInput={mode,duration_minutes:total??60,hour:Number.isInteger(hour)?hour:0,minute:Number.isInteger(minute)?minute:0};
    if(await mutate("set_caffeine_schedule",{schedule,input}) && mounted.current){hasDraft.current=false;setEditorOpen(false);setDraftError(null);}
  },[draftLoading,hours,minutes,time,mode,preview,mutate,setTimePreview]);

  useEffect(() => {
    active.current = surfaceActivity === "active";reader.invalidate();setAuthoritativeSnapshotReady(false);
    if (!active.current) return;
    let disposed = false;let unlisten: (() => void) | undefined;
    void listen("caffeine-state-changed", () => { if (!disposed) void refresh(); })
      .then((stop) => {if (disposed) { stop(); return; }unlisten = stop;void refresh();})
      .catch((err: unknown) => { if (!disposed) { setError(String(err)); void refresh(); } });
    const onFocus=()=>{void refresh();};
    window.addEventListener("focus",onFocus);
    return () => {disposed = true;active.current = false;reader.invalidate();unlisten?.();window.removeEventListener("focus",onFocus);};
  }, [reader, refresh, surfaceActivity]);

  useEffect(() => startCaffeinePresentationClock({enabled:snapshot.enabled,surfaceActivity,authoritativeSnapshotReady}, {
    now: Date.now,setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
    clearInterval: (timer) => window.clearInterval(timer as number),
  }, setNow), [authoritativeSnapshotReady, snapshot.enabled, surfaceActivity]);
  const clockObservation=useRef({wall:Date.now(),mono:performance.now()});
  useEffect(()=>{
    const current={wall:Date.now(),mono:performance.now()};
    const previous=clockObservation.current;
    clockObservation.current=current;
    if(snapshot.enabled&&active.current&&Math.abs((current.wall-previous.wall)-(current.mono-previous.mono))>2000)void refresh();
  },[now,snapshot.enabled,refresh]);
  const timing=estimateTiming(snapshot,observedAt.current,performance.now(),now);
  const finishing=timing.remaining===0;
  useEffect(()=>{if(finishing&&snapshot.enabled&&surfaceActivity==="active")void refresh();},[finishing,snapshot.enabled,surfaceActivity,refresh]);

  return {
    snapshot, enabled:snapshot.enabled,durationMinutes:snapshot.duration_minutes,error,actionError:snapshot.action_error,
    elapsed:formatDurationClock(timing.elapsed),remaining:timing.remaining===null?null:formatDurationClock(timing.remaining),finishing,
    selectedDurationMinutes,isBusy:isBusy||!authoritativeSnapshotReady,isLoading:!authoritativeSnapshotReady,
    enable,disable,selectDuration,refresh,now,
    editorOpen,openEditor,cancelEditor,applyCustom,mode,
    setMode:(value:"duration"|"until")=>{setMode(value);setDraftError(current=>current==="read"?current:null);},
    hours,setHours:(value:string)=>{setHours(value);setDraftError(current=>current==="read"?current:null);},
    minutes,setMinutes:(value:string)=>{setMinutes(value);setDraftError(current=>current==="read"?current:null);},
    time,setTimePreview,preview,draftError,draftLoading,
  };
}
