// Commands: actions with a title and maybe a shortcut, which the command
// palette lists and the keyboard runs. Plugins add their own.
import { signal } from "@preact/signals";
import { isMac } from "./runtime";
import { settings } from "../state/settings";

export interface Command {
  id: string;
  title: string;
  /** shortcut is as "Mod+K", "Space" or "Shift+ArrowRight"; Mod is Ctrl, or Cmd on macOS. */
  shortcut?: string;
  /** group sorts commands in the palette: "playback", "go to"... */
  group?: string;
  run: () => void;
  /** plugin is the ID of the plugin that added the command. */
  plugin?: string;
}

export const commands = signal<Command[]>([]);

/** registerCommand adds a command, and returns the function removing it. */
export function registerCommand(cmd: Command): () => void {
  commands.value = [...commands.peek().filter((c) => c.id !== cmd.id), cmd];
  return () => {
    commands.value = commands.peek().filter((c) => c !== cmd);
  };
}

export function runCommand(id: string): boolean {
  const cmd = commands.value.find((c) => c.id === id);
  if (!cmd) return false;
  cmd.run();
  return true;
}

/** shortcutOf returns a command's keys: those the user chose, or its own; undefined when it has none. */
export function shortcutOf(cmd: Command): string | undefined {
  const chosen = settings.value?.shortcuts?.[cmd.id];
  if (chosen !== undefined) return chosen || undefined;
  return cmd.shortcut;
}

/** shortcutLabel writes a shortcut for display: "Ctrl K". */
export function shortcutLabel(shortcut: string): string {
  return shortcut
    .split("+")
    .map((k) => {
      switch (k) {
        case "Mod":
          return isMac() ? "⌘" : "Ctrl";
        case "ArrowRight":
          return "→";
        case "ArrowLeft":
          return "←";
        case "ArrowUp":
          return "↑";
        case "ArrowDown":
          return "↓";
        default:
          return k;
      }
    })
    .join(" ");
}

/** eventShortcut writes a key event in the syntax of shortcuts, or "" for a modifier pressed alone. */
export function eventShortcut(e: KeyboardEvent): string {
  if (["Control", "Shift", "Alt", "Meta", "OS", "AltGraph", "CapsLock"].includes(e.key)) return "";
  const parts: string[] = [];
  const mod = isMac() ? e.metaKey : e.ctrlKey;
  if (mod) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

/** initShortcuts runs commands from the keyboard. */
export function initShortcuts(): void {
  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.repeat && e.key === " ") return;
    const pressed = eventShortcut(e);
    // While typing, only shortcuts with a modifier apply.
    if (typing(e.target) && !pressed.startsWith("Mod+")) return;
    // Space on a focused button presses the button.
    if (pressed === "Space" && (e.target as HTMLElement | null)?.closest("button, [role=button], a")) return;
    const cmd = commands.value.find((c) => shortcutOf(c) === pressed);
    if (!cmd) return;
    e.preventDefault();
    cmd.run();
  });
}
