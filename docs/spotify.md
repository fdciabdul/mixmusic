# Spotify

MixMusic reads your Spotify library and searches Spotify through the Spotify
Web API, and plays Spotify tracks on Spotify Connect, or from their recording
on YouTube Music.

## Sign in

Spotify lets each app it does not review serve its owner and a few people
they add, so you sign in with an app of your own. It takes two minutes:

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard)
   and create an app. Any name and description do; choose the **Web API**.
2. In the app's settings, add this redirect URI exactly:

   ```
   http://127.0.0.1:47823/callback
   ```

3. Copy the app's **Client ID**.
4. In MixMusic, open Settings › Accounts, paste the Client ID and choose
   **sign in to spotify**. Your browser opens Spotify's sign-in page; once you
   agree, it sends you back to MixMusic.

To let a friend sign in with your app, add their Spotify e-mail address
under **User Management** in the dashboard.

MixMusic never sees your password. It keeps the token Spotify gives it in
your system's credential store: the Credential Manager on Windows, the Secret
Service (GNOME Keyring, KWallet…) on Linux. Where there is none, it keeps it
in a file only your user can read, `spotify-token.json` in MixMusic's data
folder.

## How Spotify tracks play

Settings › Playback chooses:

- **On Spotify Connect** (the default). A Spotify device plays the track: your
  Spotify app on this computer, your phone, a speaker. It needs Spotify
  Premium, and a device with Spotify open. The devices button of the player
  bar chooses which device plays; by default, the active one. When no device
  can play, MixMusic plays the track from YouTube Music instead, and says so.
- **Here, from YouTube Music.** MixMusic finds the track's recording on YouTube
  Music and plays it in its own player, with the equalizer, crossfade and the
  visualizer. It works without Premium. When a match is wrong, choose **Find
  another YouTube Music match** in the track's menu.

## What Spotify allows apps

Apps in Spotify's development mode, as yours is, have limits:

- The app's owner needs Spotify Premium.
- A search returns at most ten results of each kind.
- Apps see the tracks of the playlists you own or collaborate on, not of
  playlists others made. MixMusic tells you when a playlist is one of those.
- Spotify removed the artist top tracks endpoint: MixMusic finds an artist's
  popular tracks with a search instead.
- Requests are counted against a quota; when MixMusic hits it, Spotify asks it
  to wait, and MixMusic says so.
