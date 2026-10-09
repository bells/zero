import { emitDiagnostic, type PluginContext } from "../../../src/sdk";

export async function reportOperation(context: PluginContext): Promise<void> {
  await emitDiagnostic(context.bridge, {
    level: "warn",
    code: "operation.failed",
    phase: "execute",
    outcome: "failed",
  });
}
