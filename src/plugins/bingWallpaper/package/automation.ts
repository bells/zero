import {calendarDate, marketDay, nextMidnight, publicationDate, retryAt} from './policy.js';

export interface PaperSettings {version: 1; autoChangeDaily: boolean}
export interface PaperSettingsUpdate {autoChangeDaily: boolean}
export interface PaperAutomationItem {id: string; startDate: string; displayDate?: string}
export type PaperApplyOrigin = 'manual' | 'automatic';
export interface PaperApplyIntent {
  operationId: string;
  wallpaperId: string;
  publicationDate: string | null;
  origin: PaperApplyOrigin;
  startedAt: number;
}
export interface PaperApplied {
  wallpaperId: string;
  publicationDate: string | null;
  appliedAt: number;
  origin: PaperApplyOrigin;
}
export interface PaperAutomationState {
  schemaVersion: 1;
  settings: PaperSettings;
  lastApplied: PaperApplied | null;
  manualOverrideUntil: number | null;
  pendingIntent: PaperApplyIntent | null;
  recoveryIntent: PaperApplyIntent | null;
}
export interface PaperApplyContext {
  now: number;
  toolEnabled: boolean;
  platformSupported: boolean;
  stale: boolean;
  hasError: boolean;
  items: readonly PaperAutomationItem[];
  explicitEnable: boolean;
  retryAttempt: number;
}
export type PaperCheckDecision = 'off' | 'blockedUncertain' | 'check';
export type PaperApplyDecision =
  | {kind: 'off' | 'idle' | 'unsupported' | 'blockedUncertain' | 'pausedForManual' | 'retryWaiting' | 'refreshError'; nextCheckAt: number | null}
  | {kind: 'apply'; wallpaperId: string; publicationDate: string; nextCheckAt: number};
export interface PaperApplyRequest {operationId: string; item: PaperAutomationItem; origin: PaperApplyOrigin}
export type PaperApplyOutcome = 'applied' | 'failed' | 'uncertain';
export interface PaperSettingsTransition {state: PaperAutomationState; explicitEnable: boolean}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function invalid(): never { throw new RangeError('Paper configuration or safety state is invalid; preserve the original value.'); }
function validInstant(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime());
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\u0000-\u001f\u007f]/.test(value);
}
function validDate(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && calendarDate(value.replaceAll('-', '')) === value;
}
function validOrigin(value: unknown): value is PaperApplyOrigin { return value === 'manual' || value === 'automatic'; }

export function readSettings(input: unknown): PaperSettings {
  if (!record(input) || !exactKeys(input, ['version', 'autoChangeDaily']) || input.version !== 1 || typeof input.autoChangeDaily !== 'boolean') invalid();
  return {version: 1, autoChangeDaily: input.autoChangeDaily};
}
export function createAutomationState(): PaperAutomationState {
  return {schemaVersion: 1, settings: {version: 1, autoChangeDaily: false}, lastApplied: null,
    manualOverrideUntil: null, pendingIntent: null, recoveryIntent: null};
}
function readIntent(input: unknown): PaperApplyIntent | null {
  if (input === null) return null;
  if (!record(input) || !exactKeys(input, ['operationId', 'wallpaperId', 'publicationDate', 'origin', 'startedAt'])
    || !validId(input.operationId) || !validId(input.wallpaperId) || !validDate(input.publicationDate)
    || !validOrigin(input.origin) || !validInstant(input.startedAt)) invalid();
  return {operationId: input.operationId, wallpaperId: input.wallpaperId, publicationDate: input.publicationDate,
    origin: input.origin, startedAt: input.startedAt};
}
function readApplied(input: unknown): PaperApplied | null {
  if (input === null) return null;
  if (!record(input) || !exactKeys(input, ['wallpaperId', 'publicationDate', 'appliedAt', 'origin'])
    || !validId(input.wallpaperId) || !validDate(input.publicationDate) || !validInstant(input.appliedAt) || !validOrigin(input.origin)) invalid();
  return {wallpaperId: input.wallpaperId, publicationDate: input.publicationDate, appliedAt: input.appliedAt, origin: input.origin};
}
export function readAutomationState(input: unknown): PaperAutomationState {
  if (!record(input) || !exactKeys(input, ['schemaVersion', 'settings', 'lastApplied', 'manualOverrideUntil', 'pendingIntent', 'recoveryIntent'])
    || input.schemaVersion !== 1 || input.manualOverrideUntil !== null && !validInstant(input.manualOverrideUntil)) invalid();
  return {schemaVersion: 1, settings: readSettings(input.settings), lastApplied: readApplied(input.lastApplied),
    manualOverrideUntil: input.manualOverrideUntil, pendingIntent: readIntent(input.pendingIntent), recoveryIntent: readIntent(input.recoveryIntent)};
}
export function updateSettings(state: PaperAutomationState, input: unknown): PaperSettingsTransition {
  if (!record(input) || !exactKeys(input, ['autoChangeDaily']) || typeof input.autoChangeDaily !== 'boolean') invalid();
  const explicitEnable = !state.settings.autoChangeDaily && input.autoChangeDaily;
  return {explicitEnable, state: {...state, settings: {version: 1, autoChangeDaily: input.autoChangeDaily},
    ...(explicitEnable ? {pendingIntent: null, recoveryIntent: state.pendingIntent ?? state.recoveryIntent, manualOverrideUntil: null} : {})}};
}
export function decideCheck(state: PaperAutomationState, toolEnabled: boolean): PaperCheckDecision {
  if (!toolEnabled || !state.settings.autoChangeDaily) return 'off';
  return state.pendingIntent === null ? 'check' : 'blockedUncertain';
}
export function decideApply(state: PaperAutomationState, context: PaperApplyContext): PaperApplyDecision {
  const {now} = context;
  const today = marketDay(now);
  const check = decideCheck(state, context.toolEnabled);
  if (check !== 'check') return {kind: check, nextCheckAt: null};
  if (!context.platformSupported) return {kind: 'unsupported', nextCheckAt: null};
  if (context.stale && context.hasError) return {kind: 'refreshError', nextCheckAt: retryAt(now, context.retryAttempt)};
  const item = [...context.items].sort((left, right) => right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id))[0];
  if (!item) return {kind: 'idle', nextCheckAt: nextMidnight(now)};
  if (state.manualOverrideUntil !== null && state.manualOverrideUntil > now) return {kind: 'pausedForManual', nextCheckAt: state.manualOverrideUntil};
  const date = publicationDate(item.displayDate, item.startDate, now);
  if (date === null || !context.explicitEnable && date !== today) return {kind: 'retryWaiting', nextCheckAt: retryAt(now, context.retryAttempt)};
  if (state.lastApplied?.wallpaperId === item.id) return date === today
    ? {kind: 'idle', nextCheckAt: nextMidnight(now)} : {kind: 'retryWaiting', nextCheckAt: retryAt(now, context.retryAttempt)};
  return {kind: 'apply', wallpaperId: item.id, publicationDate: date,
    nextCheckAt: date === today ? nextMidnight(now) : retryAt(now, context.retryAttempt)};
}

// This is a persistence proposal, not authorization to cross the native side-effect boundary.
// The caller must durably commit pendingIntent before requesting the OS operation.
export function prepareApply(state: PaperAutomationState, request: PaperApplyRequest, now: number): PaperAutomationState {
  marketDay(now);
  if (state.pendingIntent !== null) throw new Error('A previous wallpaper operation has an uncertain outcome.');
  if (!validId(request.operationId) || !validId(request.item.id) || !validOrigin(request.origin)) invalid();
  if (request.origin === 'automatic' && (!state.settings.autoChangeDaily || state.manualOverrideUntil !== null && state.manualOverrideUntil > now)) {
    throw new Error('Daily wallpaper automation is not authorized.');
  }
  return {...state, pendingIntent: {operationId: request.operationId, wallpaperId: request.item.id,
    publicationDate: publicationDate(request.item.displayDate, request.item.startDate, now), origin: request.origin, startedAt: now}};
}

// Commit this proposal only after persistence succeeds. If it fails, retain the durable
// pending state, even after an observed OS success; an uncertain result is never retry permission.
export function settleApply(state: PaperAutomationState, operationId: string, outcome: PaperApplyOutcome, now: number, latestDate: string | null): PaperAutomationState {
  const today = marketDay(now);
  if (!validDate(latestDate)) invalid();
  if (outcome !== 'applied' && outcome !== 'failed' && outcome !== 'uncertain') invalid();
  const intent = state.pendingIntent;
  if (intent === null || intent.operationId !== operationId) throw new Error('Wallpaper result does not match the pending operation.');
  if (outcome === 'uncertain') return state;
  if (outcome === 'failed') return {...state, pendingIntent: null};
  const date = intent.publicationDate;
  const protectManual = intent.origin === 'manual' && state.settings.autoChangeDaily
    && (date === null || date < today || latestDate !== null && date < latestDate);
  return {...state, pendingIntent: null, recoveryIntent: null,
    lastApplied: {wallpaperId: intent.wallpaperId, publicationDate: date, appliedAt: now, origin: intent.origin},
    manualOverrideUntil: protectManual ? nextMidnight(now) : state.manualOverrideUntil};
}
