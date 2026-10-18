// The commands MixMusic has itself, with their shortcuts.
import { registerCommand } from "../lib/commands";
import { navigate } from "../lib/router";
import * as player from "../player/player";
import { paletteOpen, togglePanel, toast } from "../state/ui";
import { toggleLiked } from "../state/library";
import { settings, update } from "../state/settings";
import { System } from "../mygo";
import { searchInputId } from "./TopBar";
import { startRadio } from "../lib/trackMenu";

export function registerBuiltinCommands(): void {
  const cmds: Parameters<typeof registerCommand>[0][] = [
    { id: "player.toggle", title: "Play or pause", shortcut: "Space", group: "playback", run: () => void player.toggle() },
    { id: "player.next", title: "Next track", shortcut: "Mod+ArrowRight", group: "playback", run: () => void player.next() },
    { id: "player.previous", title: "Previous track", shortcut: "Mod+ArrowLeft", group: "playback", run: () => void player.previous() },
    { id: "player.forward", title: "Forward 10 seconds", shortcut: "Shift+ArrowRight", group: "playback", run: () => void player.seek(player.position.value + 10000) },
    { id: "player.back", title: "Back 10 seconds", shortcut: "Shift+ArrowLeft", group: "playback", run: () => void player.seek(player.position.value - 10000) },
    { id: "player.volumeUp", title: "Volume up", shortcut: "Mod+ArrowUp", group: "playback", run: () => player.setVolume(player.volume.value + 0.05) },
    { id: "player.volumeDown", title: "Volume down", shortcut: "Mod+ArrowDown", group: "playback", run: () => player.setVolume(player.volume.value - 0.05) },
    { id: "player.mute", title: "Mute", shortcut: "M", group: "playback", run: player.toggleMute },
    { id: "player.shuffle", title: "Shuffle", shortcut: "Mod+S", group: "playback", run: player.toggleShuffle },
    { id: "player.repeat", title: "Repeat", shortcut: "Mod+R", group: "playback", run: player.cycleRepeat },
    {
      id: "player.like",
      title: "Like what plays",
      shortcut: "Mod+L",
      group: "playback",
      run: () => {
        const t = player.currentTrack.value;
        if (t) void toggleLiked(t);
      },
    },
    {
      id: "player.radio",
      title: "Start a radio of what plays",
      group: "playback",
      run: () => {
        const t = player.currentTrack.value;
        if (t) void startRadio(t);
        else toast("Play something first");
      },
    },
    { id: "go.home", title: "Go home", shortcut: "Alt+1", group: "go to", run: () => navigate("/") },
    {
      id: "go.search",
      title: "Search",
      shortcut: "Mod+F",
      group: "go to",
      run: () => {
        const input = document.getElementById(searchInputId) as HTMLInputElement | null;
        input?.focus();
        input?.select();
      },
    },
    { id: "go.library", title: "Library", shortcut: "Alt+2", group: "go to", run: () => navigate("/library") },
    { id: "go.liked", title: "Liked songs", shortcut: "Alt+3", group: "go to", run: () => navigate("/library/liked") },
    { id: "go.nowPlaying", title: "Now playing", shortcut: "Alt+4", group: "go to", run: () => navigate("/now-playing") },
    { id: "go.stats", title: "Stats", group: "go to", run: () => navigate("/stats") },
    { id: "go.marketplace", title: "Marketplace", group: "go to", run: () => navigate("/marketplace") },
    { id: "go.settings", title: "Settings", shortcut: "Mod+,", group: "go to", run: () => navigate("/settings") },
    { id: "view.queue", title: "Show or hide the queue", shortcut: "Mod+J", group: "view", run: () => togglePanel("queue") },
    { id: "view.lyrics", title: "Show or hide the lyrics", shortcut: "Mod+Shift+L", group: "view", run: () => togglePanel("lyrics") },
    { id: "view.palette", title: "Command palette", shortcut: "Mod+K", group: "view", run: () => (paletteOpen.value = !paletteOpen.value) },
    { id: "view.mini", title: "Mini player", shortcut: "Mod+M", group: "view", run: () => void System.showMiniPlayer() },
    {
      id: "view.sidebar",
      title: "Collapse or expand the sidebar",
      shortcut: "Mod+B",
      group: "view",
      run: () => void update({ sidebarCollapsed: !settings.value?.sidebarCollapsed }),
    },
  ];
  for (const c of cmds) registerCommand(c);
}
