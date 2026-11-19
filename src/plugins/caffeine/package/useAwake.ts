import { useEffect, useMemo, useState } from "react";
import type { ZeroBridge } from "@zero/sdk";
import { AwakeController } from "./controller";
import { defaultPreferences } from "./domain";
export function useAwake(bridge: ZeroBridge) {
    const [, render] = useState(0);
    const controller = useMemo(() => new AwakeController(bridge, () => render(value => value + 1)), [bridge]);
    useEffect(() => {
        void controller.refresh();
        const poll = () => { if (document.visibilityState !== "hidden")
            void controller.refresh(); };
        const timer = setInterval(poll, 1000);
        document.addEventListener("visibilitychange", poll);
        return () => { clearInterval(timer); document.removeEventListener("visibilitychange", poll); controller.dispose(); };
    }, [controller]);
    return { ...controller.state, preferences: controller.state.preferences ?? defaultPreferences,
        start: controller.start.bind(controller), stop: controller.stop.bind(controller),
        savePolicy: controller.savePolicy.bind(controller), retry: controller.refresh.bind(controller),
    };
}
