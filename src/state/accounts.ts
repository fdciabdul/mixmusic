// The user's accounts.
import { computed, signal } from "@preact/signals";
import { Accounts, events, type AccountsStatus } from "../mygo";

export const accounts = signal<AccountsStatus | null>(null);

/** spotifySignedIn reports whether the user signed in to Spotify. */
export const spotifySignedIn = computed(() => accounts.value?.spotify.signedIn ?? false);

export async function loadAccounts(): Promise<void> {
  events.accountsChanged.on((s) => (accounts.value = s));
  accounts.value = await Accounts.status();
}

export async function refreshAccounts(): Promise<void> {
  accounts.value = await Accounts.status();
}
