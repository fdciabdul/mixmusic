// What the user collected: liked tracks and their mixes. Pages read these
// signals so that hearts and playlist lists update everywhere at once.
import { signal } from "@preact/signals";
import { Collection, type Playlist, type Track } from "../mygo";
import { toast } from "./ui";
import { errorMessage } from "../lib/format";

export const likedIds = signal<Set<string>>(new Set());
export const mixes = signal<Playlist[]>([]);

export async function loadLibrary(): Promise<void> {
  const [ids, playlists] = await Promise.all([Collection.likedIDs(), Collection.playlists()]);
  likedIds.value = new Set(ids);
  mixes.value = playlists;
}

export const isLiked = (id: string): boolean => likedIds.value.has(id);

/** setLiked likes or unlikes a track, showing it at once. */
export async function setLiked(track: Track, liked: boolean): Promise<void> {
  const before = likedIds.value;
  const next = new Set(before);
  if (liked) next.add(track.id);
  else next.delete(track.id);
  likedIds.value = next;
  try {
    await Collection.setLiked(track, liked);
  } catch (err) {
    likedIds.value = before;
    toast(errorMessage(err), { tone: "error" });
  }
}

export const toggleLiked = (track: Track): Promise<void> => setLiked(track, !isLiked(track.id));

export async function refreshMixes(): Promise<void> {
  mixes.value = await Collection.playlists();
}

/** createMix makes a playlist holding tracks, and tells the user. */
export async function createMix(title: string, tracks: Track[] = []): Promise<Playlist> {
  const p = await Collection.createPlaylist(title, "", tracks);
  await refreshMixes();
  return p;
}

/** addToMix adds tracks to a playlist, and tells the user. */
export async function addToMix(playlist: Playlist, tracks: Track[]): Promise<void> {
  try {
    await Collection.addToPlaylist(playlist.id, tracks);
    await refreshMixes();
    toast(`Added ${tracks.length === 1 ? "1 track" : `${tracks.length} tracks`} to ${playlist.title}`);
  } catch (err) {
    toast(errorMessage(err), { tone: "error" });
  }
}
