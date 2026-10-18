// The plugin host: it starts the plugins the user enabled, and stops them
// when they are disabled or removed.
import { effect, signal } from "@preact/signals";
import type { Plugin } from "../mygo";
import { settings } from "../state/settings";
import { inventory } from "../theme/theme";
import { toast } from "../state/ui";
import { errorMessage } from "../lib/format";
import { createAPI, type API } from "./api";
import { removePlugin } from "./contributions";

interface Running {
  version: string;
  stop: () => void;
}

const running = new Map<string, Running>();

/** failures keeps why plugins failed to start, by plugin ID. */
export const failures = signal<Record<string, string>>({});

type Module = { default?: (api: API) => unknown; activate?: (api: API) => unknown };

async function start(p: Plugin): Promise<void> {
  const cleanups: (() => void)[] = [];
  let style: HTMLLinkElement | null = null;
  const stop = () => {
    for (const undo of cleanups.splice(0).reverse()) {
      try {
        undo();
      } catch (err) {
        console.error(`plugin ${p.id}:`, err);
      }
    }
    style?.remove();
    removePlugin(p.id);
  };
  running.set(p.id, { version: p.version, stop });
  try {
    if (p.styles) {
      style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = `${p.baseUrl}${p.styles}?v=${encodeURIComponent(p.version)}`;
      style.dataset.plugin = p.id;
      document.head.insertBefore(style, document.getElementById("mm-custom-css"));
    }
    const mod = (await import(/* @vite-ignore */ `${p.baseUrl}${p.main}?v=${encodeURIComponent(p.version)}`)) as Module;
    const activate = mod.default ?? mod.activate;
    if (typeof activate !== "function") throw new Error("its module exports no activate function");
    const result = await activate(createAPI(p.id, cleanups));
    if (typeof result === "function") cleanups.push(result as () => void);
    const { [p.id]: _, ...rest } = failures.peek();
    failures.value = rest;
  } catch (err) {
    stop();
    running.delete(p.id);
    const message = errorMessage(err);
    failures.value = { ...failures.peek(), [p.id]: message };
    toast(`The plugin ${p.name} failed to start: ${message}`, { tone: "error" });
  }
}

function stopPlugin(id: string): void {
  running.get(id)?.stop();
  running.delete(id);
}

/** initPlugins keeps the running plugins those enabled and installed. */
export function initPlugins(): void {
  effect(() => {
    const enabled = new Set(settings.value?.enabledPlugins ?? []);
    const available = new Map(inventory.value.plugins.map((p) => [p.id, p]));
    for (const [id, r] of running) {
      const p = available.get(id);
      if (!enabled.has(id) || !p || p.version !== r.version) stopPlugin(id);
    }
    for (const id of enabled) {
      const p = available.get(id);
      if (p && !running.has(id)) void start(p);
    }
  });
}

/** isRunning reports whether a plugin started. */
export const isRunning = (id: string): boolean => running.has(id);
