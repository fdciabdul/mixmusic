// The user's playlists on YouTube Music, which tracks of any service can go
// into from their menu.
import { effect, signal } from "@preact/signals";
import { Collection, type Playlist, type Track } from "../mygo";
import { accounts, youtubeSignedIn } from "./accounts";
import { toast } from "./ui";
import { errorMessage } from "../lib/format";

/** ytPlaylists are the playlists of the library on YouTube Music, null until read. */
export const ytPlaylists = signal<Playlist[] | null>(null);

let reading: Promise<void> | null = null;

/** loadYouTubePlaylists reads the playlists again. */
export function loadYouTubePlaylists(): Promise<void> {
  reading ??= Collection.youTubePlaylists()
    .then((list) => {
      ytPlaylists.value = list;
    })
    .catch(() => {
      ytPlaylists.value ??= [];
    })
    .finally(() => (reading = null));
  return reading;
}

// Signed in, the playlists are read; signed out, they go.
effect(() => {
  if (youtubeSignedIn.value) void loadYouTubePlaylists();
  else ytPlaylists.value = null;
});

/**
 * ownPlaylists are the playlists a track can go into: of those in the
 * library, the ones another owner's name does not mark as saved from them.
 */
export function ownPlaylists(): Playlist[] {
  const me = accounts.value?.youtube.account?.name?.toLocaleLowerCase();
  return (ytPlaylists.value ?? []).filter((p) => !p.owner || !me || p.owner.toLocaleLowerCase() === me);
}

/** addToYouTubePlaylist adds a track to a playlist of the user. */
export async function addToYouTubePlaylist(p: Playlist, track: Track): Promise<void> {
  try {
    await Collection.addToYouTubePlaylist(p.id, track);
    toast(`Added ${track.title} to ${p.title}`, { tone: "success" });
  } catch (err) {
    toast(`Couldn't add ${track.title} to ${p.title}: ${errorMessage(err)}`, { tone: "error" });
  }
}

/** createYouTubePlaylist makes a playlist on YouTube Music of tracks, and returns it. */
export async function createYouTubePlaylist(title: string, tracks: Track[]): Promise<Playlist | null> {
  try {
    if (tracks.some((t) => t.source !== "youtube")) toast("Finding the tracks on YouTube Music…");
    const p = await Collection.createYouTubePlaylist(title, tracks);
    toast(`Created ${p.title} on YouTube Music`, { tone: "success" });
    void loadYouTubePlaylists();
    return p;
  } catch (err) {
    toast(`Couldn't create ${title}: ${errorMessage(err)}`, { tone: "error" });
    return null;
  }
}
