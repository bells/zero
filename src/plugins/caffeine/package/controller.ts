import type { JsonValue, ZeroBridge, PowerSnapshot, PowerTaskSchedule, PowerTaskStatus, Result } from "@zero/sdk";
import { PREFERENCE_KEY, readPreferences, preferenceValue, taskConditions, type Preferences } from "./domain";
const unwrap = <T>(result: Result<T>): T => { if (!result.ok)
    throw new Error(result.error.code); return result.value; };
const samePolicy = (task: PowerTaskStatus, prefs: Preferences) => {
    const wanted = taskConditions(prefs);
    return task.conditions.batteryThresholdPercent === wanted.batteryThresholdPercent && task.conditions.stopOnLowPowerMode === wanted.stopOnLowPowerMode;
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : "operation_failed";
export interface AwakeState {
    preferences: Preferences | null;
    task: PowerTaskStatus | null;
    power: PowerSnapshot | null;
    ready: boolean;
    nativeReady: boolean;
    busy: boolean;
    error: string | null;
    policyPending: boolean;
}
export class AwakeController {
    state: AwakeState = { preferences: null, task: null, power: null, ready: false, nativeReady: false, busy: false, error: null, policyPending: false };
    private configReady = false;
    private running = false;
    private disposed = false;
    private pending: { action: () => Promise<void>; resolve: () => void }[] = [];
    constructor(private bridge: ZeroBridge, private changed: () => void = () => { }) { }
    dispose() {
        this.disposed = true;
        for (const intent of this.pending.splice(0))
            intent.resolve();
        this.state.busy = false;
    }
    private publish() { this.state = { ...this.state, ready: this.configReady && this.state.nativeReady }; if (!this.disposed)
        this.changed(); }
    private async config(): Promise<{
        raw: JsonValue;
        preferences: Preferences;
    }> {
        try {
            const raw = unwrap(await this.bridge.request("storage.get", { key: PREFERENCE_KEY }));
            const preferences = readPreferences(raw);
            this.state.preferences = preferences;
            this.configReady = true;
            return { raw, preferences };
        }
        catch {
            this.configReady = false;
            throw new Error("preferences_unavailable");
        }
    }
    // Read native revision before config. A competing apply after this read must conflict;
    // one before the read is followed by the latest config, never a stale mount-time policy.
    private async reconcile(): Promise<boolean> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const current = unwrap(await this.bridge.request("power.taskStatus", {}));
                this.state.task = current;
                const { preferences } = await this.config();
                if (!current?.active || samePolicy(current, preferences)) {
                    this.state.policyPending = false;
                    return true;
                }
                this.state.policyPending = true;
                this.state.task = unwrap(await this.bridge.request("power.updateTaskConditions", {
                    generation: current.generation, expectedConditionsRevision: current.conditionsRevision, conditions: taskConditions(preferences),
                }));
            }
            catch (cause: unknown) {
                this.state.policyPending = true;
                if (!this.configReady) {
                    this.state.error = message(cause);
                    return false;
                }
            }
        }
        this.state.error = "policy_pending";
        return false;
    }
    async refresh() {
        if (this.running || this.disposed)
            return;
        this.running = true;
        try {
            // Track both halves independently; a failed power read does not discard good config.
            const native = await Promise.allSettled([this.bridge.request("power.taskStatus", {}), this.bridge.request("power.readSnapshot", {})]);
            if (this.disposed)
                return;
            let nativeError: unknown = null;
            try {
                if (native[0].status !== "fulfilled")
                    throw native[0].reason;
                if (native[1].status !== "fulfilled")
                    throw native[1].reason;
                this.state.task = unwrap(native[0].value);
                this.state.power = unwrap(native[1].value);
                this.state.nativeReady = true;
            }
            catch (cause: unknown) {
                this.state.nativeReady = false;
                nativeError = cause;
            }
            await this.config();
            if (nativeError)
                throw nativeError;
            if (await this.reconcile())
                this.state.error = null;
        }
        catch (cause: unknown) {
            this.state.error = message(cause);
        }
        finally {
            this.running = false;
            await this.drain();
            this.publish();
        }
    }
    private async execute(needsConfig: boolean, action: () => Promise<void>) {
        if (this.disposed || (needsConfig ? !this.state.ready : !this.state.nativeReady))
            return;
        await new Promise<void>(resolve => {
            // Polling keeps controls usable; accepted intent waits behind its complete snapshot.
            this.pending.push({ action, resolve });
            this.state.busy = true;
            this.state.error = null;
            this.publish();
            void this.drain();
        });
    }
    private async drain() {
        if (this.running || this.disposed || this.pending.length === 0)
            return;
        this.running = true;
        try {
            while (!this.disposed && this.pending.length > 0) {
                const intent = this.pending.shift()!;
                this.state.error = null;
                try {
                    await intent.action();
                }
                catch (cause: unknown) {
                    this.state.error = message(cause);
                }
                finally {
                    intent.resolve();
                }
            }
        }
        finally {
            this.running = false;
            this.state.busy = false;
            this.publish();
        }
    }
    private async merge(change: (current: Preferences) => Preferences): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const current = await this.config();
            const next = change(current.preferences);
            // Validate our proposed value before any write as well as validating every read.
            const value = preferenceValue(readPreferences(preferenceValue(next)));
            const result = unwrap(await this.bridge.request("storage.compareAndSet", { key: PREFERENCE_KEY, expectedValue: current.raw, value }));
            this.state.preferences = readPreferences(result.currentValue);
            if (result.swapped)
                return;
        }
        throw new Error("preferences_conflict");
    }
    async start(schedule: PowerTaskSchedule, allow: boolean, custom: Preferences["custom_input"]) {
        await this.execute(true, async () => {
            let started = false;
            for (let attempt = 0; attempt < 3; attempt++) {
                const current = unwrap(await this.bridge.request("power.taskStatus", {}));
                const { preferences } = await this.config();
                const result = await this.bridge.request("power.startTask", { expectedGeneration: current?.active ? current.generation : null, expectedConditionsRevision: current?.active ? current.conditionsRevision : null, schedule, conditions: taskConditions(preferences, allow) });
                if (result.ok) {
                    this.state.task = result.value;
                    this.state.policyPending = false;
                    started = true;
                    break;
                }
                if (result.error.code !== "power.taskConflict")
                    throw new Error(result.error.code);
            }
            if (!started)
                throw new Error("power.taskConflict");
            if (custom) {
                try {
                    await this.merge(current => ({ ...current, custom_input: custom }));
                }
                catch {
                    throw new Error("preferences_save_failed");
                }
            }
            if (await this.reconcile())
                this.state.error = null;
        });
    }
    async savePolicy(patch: Partial<Preferences["battery_policy"]>) {
        await this.execute(true, async () => {
            await this.merge(current => ({ ...current, battery_policy: { ...current.battery_policy, ...patch } }));
            this.state.policyPending = true;
            this.publish();
            if (await this.reconcile())
                this.state.error = null;
        });
    }
    async stop() {
        await this.execute(false, async () => {
            const current = unwrap(await this.bridge.request("power.taskStatus", {}));
            if (current)
                unwrap(await this.bridge.request("power.stopTask", { generation: current.generation }));
            this.state.task = null;
            this.state.policyPending = false;
        });
    }
}
