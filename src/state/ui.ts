// The interface's own state: panels, toasts, menus and dialogs.
import { signal } from "@preact/signals";
import { local } from "../lib/async";

/** Which panel shows at the right of the main pane. */
export type SidePanel = "queue" | "lyrics" | null;

export const sidePanel = signal<SidePanel>(local.get<SidePanel>("mm.panel", "queue"));

export function togglePanel(panel: Exclude<SidePanel, null>): void {
  sidePanel.value = sidePanel.value === panel ? null : panel;
  local.set("mm.panel", sidePanel.value);
}

// Toasts.

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error" | "success";
  action?: { label: string; run: () => void };
}

export const toasts = signal<Toast[]>([]);
let toastSeq = 0;

/** toast shows a short notice at the bottom of the window. */
export function toast(message: string, opts: { tone?: Toast["tone"]; action?: Toast["action"]; ms?: number } = {}): void {
  const t: Toast = { id: ++toastSeq, message, tone: opts.tone ?? "info", action: opts.action };
  toasts.value = [...toasts.peek().slice(-3), t];
  setTimeout(() => dismissToast(t.id), opts.ms ?? (opts.action ? 8000 : 4500));
}

export function dismissToast(id: number): void {
  toasts.value = toasts.peek().filter((t) => t.id !== id);
}

// Context menus.

export interface MenuItem {
  label: string;
  run?: () => void;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
  separator?: boolean;
  shortcut?: string;
}

export interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
}

export const menu = signal<OpenMenu | null>(null);

/** openMenu shows a menu at a pointer event, or under an element. */
export function openMenu(at: MouseEvent | HTMLElement, items: MenuItem[]): void {
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect();
    menu.value = { x: r.left, y: r.bottom + 4, items };
  } else {
    at.preventDefault();
    menu.value = { x: at.clientX, y: at.clientY, items };
  }
}

export const closeMenu = (): void => {
  menu.value = null;
};

// Dialogs.

export interface PromptDialog {
  kind: "prompt";
  title: string;
  label: string;
  value: string;
  confirm: string;
  resolve: (value: string | null) => void;
}

export interface ConfirmDialog {
  kind: "confirm";
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export const dialog = signal<PromptDialog | ConfirmDialog | null>(null);

/** prompt asks the user for a line of text. */
export function prompt(title: string, label: string, value = "", confirm = "save"): Promise<string | null> {
  return new Promise((resolve) => {
    dialog.value = { kind: "prompt", title, label, value, confirm, resolve };
  });
}

/** confirm asks the user to confirm an action. */
export function confirm(title: string, body: string, confirm = "continue", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.value = { kind: "confirm", title, body, confirm, danger, resolve };
  });
}

/** paletteOpen shows the command palette. */
export const paletteOpen = signal(false);
