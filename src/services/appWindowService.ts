export const APP_WINDOW_COMMANDS = {
  openMainWindow: "show_main_window",
  openPreferencesWindow: "show_preferences_window",
  openAboutWindow: "show_about_window",
  quitApp: "quit_app",
} as const;

type AppWindowCommand = (typeof APP_WINDOW_COMMANDS)[keyof typeof APP_WINDOW_COMMANDS];
type InvokeBridge = (command: AppWindowCommand) => Promise<void>;

export function createAppWindowService(invokeCommand: InvokeBridge) {
  return {
    openMainWindow: () => invokeCommand(APP_WINDOW_COMMANDS.openMainWindow),
    openPreferencesWindow: () => invokeCommand(APP_WINDOW_COMMANDS.openPreferencesWindow),
    openAboutWindow: () => invokeCommand(APP_WINDOW_COMMANDS.openAboutWindow),
    quitApp: () => invokeCommand(APP_WINDOW_COMMANDS.quitApp),
  };
}
