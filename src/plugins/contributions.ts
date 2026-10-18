// What plugins add to the interface. Each entry carries the ID of its
// plugin, so that disabling the plugin removes everything it added.
import { signal } from "@preact/signals";
import type { Track } from "../mygo";

/** A cleanup function plugins return from render, called when the view goes away. */
export type Cleanup = void | (() => void);

export interface SidebarItem {
  id: string;
  label: string;
  /** icon is an SVG string of a 24×24 icon drawn in currentColor. */
  icon?: string;
  path: string;
  plugin: string;
}

export interface PluginPage {
  /** path is under /plugin/<plugin id>/. */
  path: string;
  title: string;
  render(container: HTMLElement): Cleanup;
  plugin: string;
}

export interface TrackAction {
  id: string;
  label: string;
  run(track: Track): void;
  plugin: string;
}

export interface Widget {
  id: string;
  title: string;
  render(container: HTMLElement): Cleanup;
  plugin: string;
}

export const sidebarItems = signal<SidebarItem[]>([]);
export const pluginPages = signal<PluginPage[]>([]);
export const trackActions = signal<TrackAction[]>([]);
/** widgets show in the now-playing view, beside the lyrics. */
export const widgets = signal<Widget[]>([]);

/** add appends an entry to a list, returning the function removing it. */
export function add<T>(list: { value: T[]; peek(): T[] }, entry: T): () => void {
  list.value = [...list.peek(), entry];
  return () => {
    list.value = list.peek().filter((x) => x !== entry);
  };
}

/** removePlugin removes everything a plugin added. */
export function removePlugin(plugin: string): void {
  sidebarItems.value = sidebarItems.peek().filter((x) => x.plugin !== plugin);
  pluginPages.value = pluginPages.peek().filter((x) => x.plugin !== plugin);
  trackActions.value = trackActions.peek().filter((x) => x.plugin !== plugin);
  widgets.value = widgets.peek().filter((x) => x.plugin !== plugin);
}
