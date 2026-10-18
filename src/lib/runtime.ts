// What the page knows of the app around it.
import { isMyGo, runtime } from "mygo-runtime";
import { System, type Info } from "../mygo";

let info: Info | null = null;

/** loadInfo asks the app for its version and the addresses pages load from. */
export async function loadInfo(): Promise<Info> {
  info = await System.info();
  document.documentElement.dataset.platform = info.platform;
  return info;
}

/** appInfo returns what loadInfo got; it must have run. */
export function appInfo(): Info {
  if (!info) throw new Error("loadInfo has not run");
  return info;
}

/** inApp reports whether the page runs in MixMusic rather than a browser tab. */
export const inApp = (): boolean => isMyGo();

/** platform is "win32", "linux" or "darwin". */
export function platform(): string {
  try {
    return runtime().platform;
  } catch {
    return "web";
  }
}

/** isMac reports whether shortcuts use Cmd rather than Ctrl. */
export const isMac = (): boolean => platform() === "darwin";

/** modKey names the platform's command modifier for shortcut labels. */
export const modKey = (): string => (isMac() ? "⌘" : "Ctrl");
