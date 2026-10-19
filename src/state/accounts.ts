// The user's accounts.
import { computed, signal } from "@preact/signals";
import { Accounts, events, type AccountsStatus } from "../mygo";

export const accounts = signal<AccountsStatus | null>(null);

/** spotifySignedIn reports whether the user signed in to Spotify. */
export const spotifySignedIn = computed(() => accounts.value?.spotify.signedIn ?? false);

/** youtubeSignedIn reports whether the user signed in to YouTube Music. */
export const youtubeSignedIn = computed(() => accounts.value?.youtube.signedIn ?? false);

/** signedInTo reports whether the user signed in to a service, so its library takes what they keep. */
export function signedInTo(source: string): boolean {
  return source === "youtube" ? youtubeSignedIn.value : source === "spotify" ? spotifySignedIn.value : false;
}

export async function loadAccounts(): Promise<void> {
  events.accountsChanged.on((s) => (accounts.value = s));
  accounts.value = await Accounts.status();
}

export async function refreshAccounts(): Promise<void> {
  accounts.value = await Accounts.status();
}
