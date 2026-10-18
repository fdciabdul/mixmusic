// The context menu of a track, shared by every list of tracks.
import { Collection, Player, System, type Track } from "../mygo";
import * as player from "../player/player";
import { addToMix, createMix, isLiked, mixes, toggleLiked } from "../state/library";
import { prompt, toast, type MenuItem } from "../state/ui";
import { trackActions } from "../plugins/contributions";
import { href, navigate } from "./router";
import { errorMessage, plural, sourceName } from "./format";
import { Catalog } from "../mygo";

export interface TrackMenuContext {
  /** removeFromMix is set in a mix, removing the track at its index. */
  removeFromMix?: () => void;
  /** queueIndex is set in the queue. */
  queueIndex?: number;
}

/** trackMenu returns the menu items of a track. */
export function trackMenu(track: Track, ctx: TrackMenuContext = {}): MenuItem[] {
  const items: MenuItem[] = [];
  if (ctx.queueIndex == null) {
    items.push(
      { label: "Play", icon: "play", run: () => void player.playTracks([track]) },
      { label: "Play next", icon: "queue", run: () => (player.playNext([track]), toast(`${track.title} plays next`)) },
      { label: "Add to queue", icon: "plus", run: () => (player.enqueue([track]), toast(`Added ${track.title} to the queue`)) },
    );
  } else {
    items.push(
      { label: "Play", icon: "play", run: () => void player.playAt(ctx.queueIndex!) },
      { label: "Remove from queue", icon: "close", run: () => player.removeAt(ctx.queueIndex!) },
    );
  }
  items.push({ label: "Start radio", icon: "radio", run: () => void startRadio(track) });
  items.push({ separator: true, label: "" });
  items.push({
    label: isLiked(track.id) ? "Remove from liked songs" : "Add to liked songs",
    icon: "heart",
    run: () => void toggleLiked(track),
  });
  items.push({
    label: "Add to mix",
    icon: "plus",
    submenu: [
      {
        label: "New mix…",
        icon: "plus",
        run: async () => {
          const title = await prompt("New mix", "Name", track.title, "create");
          if (title) {
            await createMix(title, [track]);
            toast(`Created ${title}`);
          }
        },
      },
      ...(mixes.value.length > 0 ? [{ separator: true, label: "" } as MenuItem] : []),
      ...mixes.value.map((m) => ({ label: m.title, run: () => void addToMix(m, [track]) })),
    ],
  });
  if (ctx.removeFromMix) items.push({ label: "Remove from this mix", icon: "trash", run: ctx.removeFromMix, danger: true });
  items.push({ separator: true, label: "" });
  const artist = track.artists.find((a) => a.id);
  if (artist?.id) items.push({ label: `Go to ${artist.name}`, icon: "user", run: () => navigate(href.artist(artist.id!)) });
  if (track.album?.id) items.push({ label: "Go to album", icon: "disc", run: () => navigate(href.album(track.album!.id!)) });
  if (track.url) {
    items.push({ label: `Open in ${sourceName(track.source)}`, icon: "external", run: () => void System.openExternal(track.url!) });
    items.push({
      label: "Copy link",
      icon: "link",
      run: () => navigator.clipboard.writeText(track.url!).then(() => toast("Link copied")),
    });
  }
  if (track.source === "spotify") {
    items.push({
      label: "Find another YouTube Music match",
      icon: "refresh",
      run: () => Player.forgetMatch(track.id).then(() => toast("The next play looks for its recording again")),
    });
  }
  const actions = trackActions.value;
  if (actions.length > 0) {
    items.push({ separator: true, label: "" });
    for (const a of actions) items.push({ label: a.label, icon: "puzzle", run: () => a.run(track) });
  }
  return items;
}

/** startRadio replaces the queue with the track and tracks like it. */
export async function startRadio(track: Track): Promise<void> {
  try {
    toast(`Starting a radio of ${track.title}…`);
    const tracks = await Catalog.radio(track);
    await player.playTracks([track, ...tracks]);
  } catch (err) {
    toast(errorMessage(err), { tone: "error" });
  }
}

/** collectionMenu is the menu of a whole list of tracks. */
export function collectionMenu(title: string, tracks: Track[], importId?: string): MenuItem[] {
  const items: MenuItem[] = [
    { label: "Play", icon: "play", run: () => void player.playTracks(tracks) },
    { label: "Play next", icon: "queue", run: () => (player.playNext(tracks), toast(`${plural(tracks.length, "track")} play next`)) },
    { label: "Add to queue", icon: "plus", run: () => (player.enqueue(tracks), toast(`Added ${plural(tracks.length, "track")} to the queue`)) },
    {
      label: "Save as a new mix",
      icon: "plus",
      run: async () => {
        const name = await prompt("New mix", "Name", title, "create");
        if (name) {
          await createMix(name, tracks);
          toast(`Created ${name}`);
        }
      },
    },
  ];
  if (importId) {
    items.push({
      label: "Copy into a mix you can extend",
      icon: "download",
      run: () =>
        Collection.importPlaylist(importId).then(
          (p) => (toast(`Copied into ${p.title}`), navigate(href.playlist(p.id))),
          (err) => toast(errorMessage(err), { tone: "error" }),
        ),
    });
  }
  return items;
}
