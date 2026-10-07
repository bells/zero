import type { CheckPluginCompatibilityInput, CompatibilityReport, OpenPluginViewInput } from "./protocol/contracts";
import type {
  InstallMarketPluginInput,
  InstallPluginPackageInput,
  PluginIdentityInput,
  PluginLifecycleResult,
  PluginMarketEntry,
  PluginMarketSnapshot,
  PluginPackageValidationReport,
  PluginRecord,
  SetPluginEnabledInput,
  ValidatePluginPackageInput,
} from "./contracts";

export const PLUGIN_HOST_COMMANDS = {
  openView: "open_plugin_view",
  checkCompatibility: "check_plugin_compatibility",
  refreshMarket: "refresh_plugin_market",
  listMarketPlugins: "list_market_plugins",
  listPlugins: "list_plugins",
  registrySnapshot: "get_plugin_registry_snapshot",
  validatePackage: "validate_plugin_package",
  installMarketPlugin: "install_market_plugin",
  installPluginPackage: "install_plugin_package",
  uninstallPlugin: "uninstall_plugin",
  setPluginEnabled: "set_plugin_enabled",
  restoreBundledPlugins: "restore_bundled_plugins",
} as const;

export type PluginHostCommand =
  (typeof PLUGIN_HOST_COMMANDS)[keyof typeof PLUGIN_HOST_COMMANDS];

export type PluginHostInvokeArgs =
  | { input: CheckPluginCompatibilityInput }
  | { input: OpenPluginViewInput }
  | { input: ValidatePluginPackageInput }
  | { input: InstallPluginPackageInput }
  | { input: InstallMarketPluginInput }
  | { input: PluginIdentityInput }
  | { input: SetPluginEnabledInput };

export type PluginHostInvokeBridge = <T>(
  command: PluginHostCommand,
  args?: PluginHostInvokeArgs,
) => Promise<T>;

export function createPluginHostService(invokeCommand: PluginHostInvokeBridge) {
  return {
    openView(input: OpenPluginViewInput): Promise<import("./protocol/contracts").PluginSessionInfo> {
      return invokeCommand(PLUGIN_HOST_COMMANDS.openView, { input });
    },
    checkCompatibility(input: CheckPluginCompatibilityInput): Promise<CompatibilityReport> {
      return invokeCommand<CompatibilityReport>(PLUGIN_HOST_COMMANDS.checkCompatibility, { input });
    },
    refreshMarket(): Promise<PluginMarketSnapshot> {
      return invokeCommand<PluginMarketSnapshot>(PLUGIN_HOST_COMMANDS.refreshMarket);
    },

    listMarketPlugins(): Promise<PluginMarketEntry[]> {
      return invokeCommand<PluginMarketEntry[]>(PLUGIN_HOST_COMMANDS.listMarketPlugins);
    },

    registrySnapshot(): Promise<import("./protocol/contracts").PluginRegistrySnapshot> {
      return invokeCommand(PLUGIN_HOST_COMMANDS.registrySnapshot);
    },

    listPlugins(): Promise<PluginRecord[]> {
      return invokeCommand<PluginRecord[]>(PLUGIN_HOST_COMMANDS.listPlugins);
    },

    validatePackage(
      input: ValidatePluginPackageInput,
    ): Promise<PluginPackageValidationReport> {
      return invokeCommand<PluginPackageValidationReport>(
        PLUGIN_HOST_COMMANDS.validatePackage,
        { input },
      );
    },

    installMarketPlugin(input: InstallMarketPluginInput): Promise<PluginRecord> {
      return invokeCommand<PluginRecord>(PLUGIN_HOST_COMMANDS.installMarketPlugin, {
        input,
      });
    },

    installPluginPackage(input: InstallPluginPackageInput): Promise<PluginRecord> {
      return invokeCommand<PluginRecord>(PLUGIN_HOST_COMMANDS.installPluginPackage, {
        input,
      });
    },

    uninstallPlugin(input: PluginIdentityInput): Promise<PluginLifecycleResult> {
      return invokeCommand<PluginLifecycleResult>(
        PLUGIN_HOST_COMMANDS.uninstallPlugin,
        { input },
      );
    },

    setPluginEnabled(input: SetPluginEnabledInput): Promise<PluginRecord> {
      return invokeCommand<PluginRecord>(PLUGIN_HOST_COMMANDS.setPluginEnabled, {
        input,
      });
    },

    restoreBundledPlugins(): Promise<PluginRecord[]> {
      return invokeCommand<PluginRecord[]>(
        PLUGIN_HOST_COMMANDS.restoreBundledPlugins,
      );
    },
  };
}
