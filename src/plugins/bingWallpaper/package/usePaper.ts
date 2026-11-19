import {useEffect, useSyncExternalStore} from 'react';
import type {PaperController} from './controller.js';
import {marketDay, nextMidnight} from './policy.js';
export function usePaper(controller: PaperController) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    void controller.start();
    let day = marketDay(Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      void controller.refreshStatus();
      const now = Date.now(), nextDay = marketDay(now);
      if (day !== nextDay) {day = nextDay; void controller.refresh();}
      timer = setTimeout(check, nextMidnight(now) - now + 50);
    };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {if (timer !== undefined) clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); controller.dispose();};
  }, [controller]);
  return state;
}
