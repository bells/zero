import {registerBackground} from '@zero/sdk';
import {runPaperBackground} from './backgroundWorkflow.js';
import {createPaperHost} from './host.js';

registerBackground(async (event, context) => {
  if (event.eventId !== 'paper.daily') return {outcome: 'failed', nextAtMs: null};
  const payload = event.payload;
  const enabledAt = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && typeof payload.explicitEnableAtMs === 'number' && Number.isFinite(payload.explicitEnableAtMs)
    ? payload.explicitEnableAtMs : undefined;
  return runPaperBackground(createPaperHost(context.bridge), {
    attempt: event.attempt, signal: context.signal,
    ...(enabledAt === undefined ? {} : {explicitEnableAtMs: enabledAt}),
  });
});
