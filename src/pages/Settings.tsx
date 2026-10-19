// Settings: appearance, playback, accounts, plugins, the desktop,
// shortcuts, and about.
import { useEffect, useState } from "preact/hooks";
import { Channel } from "mygo-runtime";
import { PageHeader } from "../components/PageHeader";
import { Choices, Group, Row, Select, Switch } from "../components/Controls";
import { Slider } from "../components/Slider";
import { Icon } from "../components/Icon";
import { Problem } from "../components/States";
import {
  Accounts,
  Addons,
  events,
  Player,
  Preferences,
  System,
  type Density,
  type InstallProgress,
  type Option,
  type Plugin,
  type Quality,
  type Settings as SettingsData,
  type SpotifyPlayback,
  type Theme,
} from "../mygo";
import { settings, update } from "../state/settings";
import { accounts, refreshAccounts } from "../state/accounts";
import { useAsync } from "../lib/async";
import { navigate } from "../lib/router";
import { bytes, errorMessage } from "../lib/format";
import { commands, eventShortcut, shortcutLabel, shortcutOf } from "../lib/commands";
import { appInfo } from "../lib/runtime";
import { activeTheme, inventory, optionValues, themePatch, themes } from "../theme/theme";
import { BANDS, PRESETS, bandLabel } from "../player/eq";
import { confirm, toast } from "../state/ui";
import { failures } from "../plugins/host";

const tabs = [
  { id: "appearance", label: "appearance" },
  { id: "playback", label: "playback" },
  { id: "accounts", label: "accounts" },
  { id: "plugins", label: "plugins" },
  { id: "desktop", label: "desktop" },
  { id: "shortcuts", label: "shortcuts" },
  { id: "about", label: "about" },
];

export function Settings({ tab }: { tab?: string }) {
  const s = settings.value;
  const active = tabs.find((t) => t.id === tab)?.id ?? "appearance";
  return (
    <div class="mm-page">
      <PageHeader title="settings" active={active} pivots={tabs} onPivot={(id) => navigate(`/settings/${id}`, { replace: true })} />
      {s && (
        <div class="mm-settings">
          {active === "appearance" && <Appearance s={s} />}
          {active === "playback" && <Playback s={s} />}
          {active === "accounts" && <AccountsTab s={s} />}
          {active === "plugins" && <PluginsTab s={s} />}
          {active === "desktop" && <Desktop s={s} />}
          {active === "shortcuts" && <Shortcuts s={s} />}
          {active === "about" && <About />}
        </div>
      )}
    </div>
  );
}

const save = (patch: Partial<SettingsData>) => update(patch).catch((err) => toast(errorMessage(err), { tone: "error" }));

// Appearance.

function Appearance({ s }: { s: SettingsData }) {
  const theme = activeTheme.value;
  return (
    <>
      <Group
        title="theme"
        action={
          <div class="mm-actions">
            <button type="button" class="mm-text-button" onClick={() => navigate("/marketplace/themes")}>
              get more themes
            </button>
            <button type="button" class="mm-text-button" onClick={() => Addons.openFolder("theme")}>
              open themes folder
            </button>
          </div>
        }
      >
        <Row
          title="Follow the computer"
          description="Show one theme while the computer is in light mode and another in dark mode. The theme you pick below is the one for the mode it is in now."
        >
          <Switch on={s.followSystem} label="Follow the computer" onChange={(v) => save({ followSystem: v })} />
        </Row>
        {s.followSystem && (
          <>
            <Row title="In light mode">
              <Select value={s.lightTheme} label="Theme in light mode" options={themeOptions()} onChange={(id) => save({ lightTheme: id })} />
            </Row>
            <Row title="In dark mode">
              <Select value={s.darkTheme} label="Theme in dark mode" options={themeOptions()} onChange={(id) => save({ darkTheme: id })} />
            </Row>
          </>
        )}
        <div class="mm-theme-grid" role="radiogroup" aria-label="Theme">
          {themes.value.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              active={t.id === theme?.id}
              onPick={() => save(themePatch(s, t.id))}
            />
          ))}
        </div>
        {inventory.value.problems.filter((p) => p.kind === "theme").map((p) => (
          <p class="mm-hint mm-hint-error" key={p.folder}>
            The theme in “{p.folder}” did not load: {p.error}
          </p>
        ))}
      </Group>

      {theme && theme.options.length > 0 && (
        <Group title={`${theme.name} options`}>
          {theme.options.map((o) => (
            <ThemeOption key={o.id} theme={theme} option={o} s={s} />
          ))}
        </Group>
      )}

      <Group title="colour and type">
        <Row title="Follow the artwork" description="Take the accent colour from the artwork of what plays.">
          <Switch on={s.dynamicAccent} label="Follow the artwork" onChange={(v) => save({ dynamicAccent: v })} />
        </Row>
        <Row title="Accent colour" description="Replaces the theme's accent when the artwork does not set it.">
          <div class="mm-actions">
            <input
              type="color"
              class="mm-color"
              aria-label="Accent colour"
              value={s.accent || theme?.colors["accent"] || "#00bde3"}
              onChange={(e) => save({ accent: (e.target as HTMLInputElement).value })}
            />
            {s.accent && (
              <button type="button" class="mm-text-button" onClick={() => save({ accent: "" })}>
                use the theme's
              </button>
            )}
          </div>
        </Row>
        <Row title="Text size">
          <Slider
            value={s.fontScale}
            min={0.85}
            max={1.3}
            step={0.05}
            label="Text size"
            valueText={`${Math.round(s.fontScale * 100)}%`}
            onInput={(v) => save({ fontScale: v })}
          />
        </Row>
        <Row title="Density" description="Compact fits more rows on the screen.">
          <Select<Density>
            value={s.density}
            label="Density"
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(v) => save({ density: v })}
          />
        </Row>
      </Group>

      <Group title="your own css">
        <CustomCSS value={s.customCss} />
      </Group>
    </>
  );
}

/** themeOptions lists the themes for a select, the light ones and the dark ones each together. */
function themeOptions(): { value: string; label: string }[] {
  return [...themes.value]
    .sort((a, b) => (a.scheme === b.scheme ? a.name.localeCompare(b.name) : a.scheme === "light" ? -1 : 1))
    .map((t) => ({ value: t.id, label: `${t.name} (${t.scheme})` }));
}

function ThemeCard({ theme, active, onPick }: { theme: Theme; active: boolean; onPick: () => void }) {
  const c = theme.colors;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      class="mm-theme-card"
      onClick={onPick}
      style={{ background: c["bg"], color: c["text"], borderRadius: theme.radius, fontFamily: theme.fonts.display || undefined }}
    >
      <span class="mm-theme-tiles" aria-hidden="true">
        {["tile-1", "tile-2", "tile-3", "tile-4"].map((k) => (
          <span key={k} style={{ background: c[k] }} />
        ))}
      </span>
      <span class="mm-theme-name">{theme.name.toLocaleLowerCase()}</span>
      <span class="mm-theme-meta" style={{ color: c["text-muted"] }}>
        {theme.builtin ? "built in" : `by ${theme.author}`}
      </span>
      {active && (
        <span class="mm-theme-check" style={{ background: c["accent"], color: c["accent-text"] }}>
          <Icon name="check" size={14} />
        </span>
      )}
    </button>
  );
}

function ThemeOption({ theme, option, s }: { theme: Theme; option: Option; s: SettingsData }) {
  const value = optionValues(theme, s)[option.id] ?? option.default;
  const set = (v: string) =>
    save({ themeOptions: { ...s.themeOptions, [theme.id]: { ...(s.themeOptions[theme.id] ?? {}), [option.id]: v } } });
  let control;
  switch (option.type) {
    case "toggle":
      control = <Switch on={value === "true"} label={option.label} onChange={(on) => set(String(on))} />;
      break;
    case "select":
      control = <Select value={value} label={option.label} options={(option.choices ?? []).map((c) => ({ value: c.value, label: c.label }))} onChange={set} />;
      break;
    case "color":
      control = <input type="color" class="mm-color" aria-label={option.label} value={value} onChange={(e) => set((e.target as HTMLInputElement).value)} />;
      break;
    case "range":
      control = (
        <Slider
          value={Number(value)}
          min={option.min ?? 0}
          max={option.max ?? 100}
          step={option.step || 1}
          label={option.label}
          valueText={`${value}${option.unit ?? ""}`}
          onInput={(v) => set(String(v))}
        />
      );
      break;
  }
  return <Row title={option.label}>{control}</Row>;
}

function CustomCSS({ value }: { value: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div class="mm-css-editor">
      <textarea
        class="mm-textarea"
        spellcheck={false}
        value={draft}
        aria-label="Your own CSS"
        placeholder={":root {\n  --mm-accent: #ff6a00;\n}\n.mm-page-title {\n  letter-spacing: -0.02em;\n}"}
        onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
      />
      <div class="mm-actions">
        <button type="button" class="mm-button mm-button-primary" disabled={draft === value} onClick={() => save({ customCss: draft })}>
          apply
        </button>
        <span class="mm-hint">It loads after the theme. The documented hooks are in docs/themes.md.</span>
      </div>
    </div>
  );
}

// Playback.

function Playback({ s }: { s: SettingsData }) {
  const signedIn = accounts.value?.spotify.signedIn ?? false;
  return (
    <>
      <Group title="spotify tracks">
        <Choices<SpotifyPlayback>
          value={s.spotifyPlayback}
          label="How Spotify tracks play"
          onChange={(v) => save({ spotifyPlayback: v })}
          choices={[
            {
              value: "connect",
              title: "on spotify connect",
              description: "Your Spotify app, or another Spotify device, plays them, at Spotify's own quality. Needs Spotify Premium and a device with Spotify open.",
            },
            {
              value: "match",
              title: "here, from youtube music",
              description: "MixMusic plays their recording on YouTube Music, with the equalizer, crossfade and visualizer. Works without Premium.",
            },
          ]}
        />
        {!signedIn && (
          <p class="mm-hint">
            Sign in to Spotify in{" "}
            <a href="/settings/accounts" onClick={(e) => (e.preventDefault(), navigate("/settings/accounts"))}>
              accounts
            </a>{" "}
            to play your Spotify library.
          </p>
        )}
        {signedIn && s.spotifyPlayback === "connect" && <DeviceRow s={s} />}
      </Group>

      <Group title="sound">
        <Row title="Quality" description="Data saver streams smaller files of YouTube Music.">
          <Select<Quality>
            value={s.quality}
            label="Quality"
            options={[
              { value: "best", label: "Best" },
              { value: "saver", label: "Data saver" },
            ]}
            onChange={(v) => save({ quality: v })}
          />
        </Row>
        <Row title="Crossfade" description={s.crossfade === 0 ? "Off: tracks follow each other." : `Tracks overlap by ${s.crossfade} seconds.`}>
          <Slider value={s.crossfade} min={0} max={12} step={1} label="Crossfade" valueText={`${s.crossfade} seconds`} onInput={(v) => save({ crossfade: v })} />
        </Row>
        <Row title="Volume levelling" description="Evens out loud and quiet tracks.">
          <Switch on={s.normalize} label="Volume levelling" onChange={(v) => save({ normalize: v })} />
        </Row>
        <Row title="Autoplay" description="When the queue runs out, a radio of what you played carries on.">
          <Switch on={s.autoplay} label="Autoplay" onChange={(v) => save({ autoplay: v })} />
        </Row>
      </Group>

      <Equalizer s={s} />
      <Cache s={s} />
      <Tools s={s} />
    </>
  );
}

function DeviceRow({ s }: { s: SettingsData }) {
  const devices = useAsync(() => Player.devices(), []);
  return (
    <Row title="Device" description="Where Spotify tracks play. Open Spotify on a device for it to show here.">
      <div class="mm-actions">
        <Select
          value={s.spotifyDevice}
          label="Device"
          options={[{ value: "", label: "The active device" }, ...(devices.data ?? []).map((d) => ({ value: d.id, label: d.name }))]}
          onChange={(v) => save({ spotifyDevice: v })}
        />
        <button type="button" class="mm-icon-button" aria-label="Look for devices again" onClick={devices.reload}>
          <Icon name="refresh" size={16} />
        </button>
      </div>
    </Row>
  );
}

function Equalizer({ s }: { s: SettingsData }) {
  const eq = s.equalizer;
  const setGain = (i: number, v: number) => {
    const gains = [...eq.gains];
    gains[i] = v;
    save({ equalizer: { ...eq, gains, preset: "custom" } });
  };
  return (
    <Group
      title="equalizer"
      action={<Switch on={eq.enabled} label="Equalizer" onChange={(on) => save({ equalizer: { ...eq, enabled: on } })} />}
    >
      <p class="mm-hint">It shapes what MixMusic plays itself; Spotify Connect devices have their own.</p>
      <div class="mm-chips" role="radiogroup" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={eq.preset === p.id}
            class="mm-chip"
            onClick={() => save({ equalizer: { ...eq, enabled: true, preset: p.id, gains: p.gains } })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div class="mm-eq" data-off={!eq.enabled || undefined}>
        {BANDS.map((hz, i) => (
          <label class="mm-eq-band" key={hz}>
            <span class="mm-eq-value mm-num">{(eq.gains[i] ?? 0) > 0 ? "+" : ""}{(eq.gains[i] ?? 0).toFixed(0)}</span>
            <Slider
              class="mm-eq-slider"
              value={eq.gains[i] ?? 0}
              min={-12}
              max={12}
              step={0.5}
              label={`${bandLabel(hz)} hertz`}
              valueText={`${eq.gains[i] ?? 0} decibels`}
              onInput={(v) => setGain(i, v)}
            />
            <span class="mm-eq-freq mm-num">{bandLabel(hz)}</span>
          </label>
        ))}
      </div>
      <Row title="Preamp">
        <Slider value={eq.preamp} min={-12} max={12} step={0.5} label="Preamp" valueText={`${eq.preamp} decibels`} onInput={(v) => save({ equalizer: { ...eq, preamp: v } })} />
      </Row>
    </Group>
  );
}

function Cache({ s }: { s: SettingsData }) {
  const usage = useAsync(() => System.cacheUsage(), []);
  return (
    <Group title="offline cache">
      <Row
        title="Keep played tracks"
        description={usage.data ? `${usage.data.tracks} tracks, ${bytes(usage.data.bytes)}. Tracks played to the end play again without the network.` : "Tracks played to the end play again without the network."}
      >
        <Select
          value={String(s.cacheSizeMb)}
          label="Cache size"
          options={[
            { value: "0", label: "Off" },
            { value: "512", label: "512 MB" },
            { value: "1024", label: "1 GB" },
            { value: "4096", label: "4 GB" },
            { value: "16384", label: "16 GB" },
          ]}
          onChange={(v) => save({ cacheSizeMb: Number(v) })}
        />
      </Row>
      <div class="mm-actions">
        <button type="button" class="mm-button mm-button-outline" onClick={() => System.clearCache().then(() => (usage.reload(), toast("Cache cleared")))}>
          clear cache
        </button>
      </div>
    </Group>
  );
}

/** InstallYTDLP downloads yt-dlp, showing the download's progress. */
export function InstallYTDLP({ onDone, update: isUpdate }: { onDone?: () => void; update?: boolean }) {
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const ch = new Channel<InstallProgress>((p) => setProgress(p));
      const status = await System.installYTDLP(ch);
      toast(`yt-dlp ${status.ytdlp.version} is ready`, { tone: "success" });
      onDone?.();
    } catch (err) {
      toast(`Couldn't install yt-dlp: ${errorMessage(err)}`, { tone: "error" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <button type="button" class="mm-button mm-button-primary" disabled={busy} onClick={run}>
      <Icon name="download" size={16} />
      {busy ? (pct != null ? `downloading ${pct}%` : "downloading…") : isUpdate ? "update yt-dlp" : "install yt-dlp"}
    </button>
  );
}

function Tools({ s }: { s: SettingsData }) {
  const tools = useAsync(() => System.tools(), [s.ytdlpPath, s.jsRuntime]);
  const t = tools.data;
  return (
    <Group title="tools">
      <Row
        title="yt-dlp"
        description={
          t?.ytdlp.found
            ? `${t.ytdlp.version} · ${t.ytdlp.path}${t.ytdlp.managed ? " · MixMusic updates it every day" : ""}`
            : "Finds the audio of YouTube Music tracks. Not installed yet."
        }
      >
        {t && (!t.ytdlp.found || t.ytdlp.managed) && <InstallYTDLP onDone={tools.reload} update={t.ytdlp.found} />}
      </Row>
      <Row
        title="JavaScript runtime"
        description={
          t?.jsRuntime.found
            ? `${t.jsRuntime.name} ${t.jsRuntime.version} · yt-dlp uses it to solve YouTube's challenges.`
            : "yt-dlp needs Deno, Node.js, Bun or QuickJS to read most YouTube streams. Install one, and MixMusic finds it."
        }
      >
        <Select
          value={s.jsRuntime}
          label="JavaScript runtime"
          options={[
            { value: "", label: "Find one" },
            { value: "deno", label: "Deno" },
            { value: "node", label: "Node.js" },
            { value: "bun", label: "Bun" },
            { value: "quickjs", label: "QuickJS" },
          ]}
          onChange={(v) => save({ jsRuntime: v })}
        />
      </Row>
      <Row title="Own yt-dlp" description="Use a yt-dlp of your own, such as your package manager's, instead.">
        <input
          class="mm-input"
          placeholder="path to yt-dlp"
          value={s.ytdlpPath}
          onChange={(e) => save({ ytdlpPath: (e.target as HTMLInputElement).value.trim() })}
        />
      </Row>
    </Group>
  );
}

// Accounts.

function AccountsTab({ s }: { s: SettingsData }) {
  const sp = accounts.value?.spotify;
  const [clientId, setClientId] = useState(s.spotifyClientId);
  const [busy, setBusy] = useState(false);
  useEffect(() => setClientId(s.spotifyClientId), [s.spotifyClientId]);
  const signIn = async () => {
    setBusy(true);
    try {
      if (clientId.trim() !== s.spotifyClientId) await update({ spotifyClientId: clientId.trim() });
      toast("Finish signing in in your browser");
      await Accounts.spotifyLogin();
      await refreshAccounts();
      toast("Signed in to Spotify", { tone: "success" });
    } catch (err) {
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Group title="spotify">
        {sp?.signedIn && sp.profile ? (
          <Row title={`Signed in as ${sp.profile.name}`} description="Search, your library and playback on Spotify Connect.">
            <button
              type="button"
              class="mm-button mm-button-outline"
              onClick={async () => {
                if (await confirm("Sign out of Spotify", "MixMusic forgets your Spotify sign-in.", "sign out")) {
                  await Accounts.spotifyLogout();
                  await refreshAccounts();
                }
              }}
            >
              sign out
            </button>
          </Row>
        ) : (
          <>
            {sp?.error && <Problem title="Spotify refused the sign-in" message={sp.error} />}
            <ol class="mm-steps">
              <li>
                Create an app in the{" "}
                <a href="https://developer.spotify.com/dashboard" onClick={(e) => (e.preventDefault(), System.openExternal("https://developer.spotify.com/dashboard"))}>
                  Spotify developer dashboard
                </a>
                , with the Web API.
              </li>
              <li>
                Add this redirect URI to it: <code class="mm-code">{sp?.redirectUri ?? appInfo().redirectUri}</code>
              </li>
              <li>Paste the app's Client ID here, and sign in.</li>
            </ol>
            <Row title="Client ID">
              <input
                class="mm-input"
                spellcheck={false}
                placeholder="32 letters and digits"
                value={clientId}
                onInput={(e) => setClientId((e.target as HTMLInputElement).value)}
              />
            </Row>
            <div class="mm-actions">
              <button type="button" class="mm-button mm-button-primary" disabled={busy || !clientId.trim()} onClick={signIn}>
                {busy ? "waiting for the browser…" : "sign in to spotify"}
              </button>
            </div>
            <p class="mm-hint">
              Spotify lets apps in development mode serve their owner and a few people they add, and its owner needs Premium. Search shows ten results of each kind, and the tracks of playlists you do not own stay hidden to apps.
            </p>
          </>
        )}
      </Group>
      <YouTubeAccountGroup s={s} />
      <Lastfm s={s} />
    </>
  );
}

function YouTubeAccountGroup({ s }: { s: SettingsData }) {
  const yt = accounts.value?.youtube;
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    try {
      await Accounts.youTubeLogin();
      await refreshAccounts();
      toast("Signed in to YouTube Music", { tone: "success" });
    } catch (err) {
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  if (yt?.signedIn) {
    return (
      <Group title="youtube music">
        {yt.error && <Problem title="YouTube Music refused the sign-in" message={`${yt.error}. Sign out, then sign in again.`} />}
        <Row
          title={yt.account ? `Signed in as ${yt.account.name}` : "Signed in"}
          description="Your home feed, your library, and likes that reach YouTube Music."
        >
          <button
            type="button"
            class="mm-button mm-button-outline"
            onClick={async () => {
              if (!(await confirm("Sign out of YouTube Music", "MixMusic forgets your YouTube Music session; your library stays on YouTube Music.", "sign out"))) return;
              await Accounts.youTubeLogout();
              await refreshAccounts();
            }}
          >
            sign out
          </button>
        </Row>
        <YouTubeChannels />
        <Row
          title="Add what you play to your history"
          description="YouTube Music makes its home and its radios of your history. Tracks join it once they played a while, as they do on Last.fm."
        >
          <Switch on={s.youtubeHistory} label="Add what you play to your YouTube Music history" onChange={(v) => save({ youtubeHistory: v })} />
        </Row>
      </Group>
    );
  }
  return (
    <Group title="youtube music">
      <p class="mm-hint">
        YouTube Music needs no account: search, artists, albums, playlists and radios work signed out. Signed in, MixMusic shows your own home feed and library, and saves
        what you like and follow to YouTube Music. Tracks play as they do signed out: your session never goes to yt-dlp.
      </p>
      <div class="mm-actions">
        <button type="button" class="mm-button mm-button-primary" disabled={busy} onClick={signIn}>
          {busy ? "waiting for the sign-in window…" : "sign in to youtube music"}
        </button>
      </div>
      <p class="mm-hint">
        You sign in on Google's own page, in a window of MixMusic: MixMusic never sees your password, and keeps the session encrypted on this computer. YouTube Music
        does not offer this to apps officially, so it may stop working when YouTube changes.
      </p>
    </Group>
  );
}

function Lastfm({ s }: { s: SettingsData }) {
  const lf = accounts.value?.lastfm;
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const open = (url: string) => (e: MouseEvent) => (e.preventDefault(), System.openExternal(url));
  const connect = async () => {
    setBusy(true);
    try {
      toast("Approve MixMusic on Last.fm, in your browser");
      await Accounts.lastfmLogin(key, secret);
      await refreshAccounts();
      setSecret("");
      toast("Connected to Last.fm", { tone: "success" });
    } catch (err) {
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  if (lf?.connected) {
    return (
      <Group title="last.fm">
        {lf.expired && <Problem title="Last.fm no longer accepts this connection" message="Disconnect, then connect again to go on scrobbling." />}
        <Row title={`Scrobbling as ${lf.name}`} description="What you listen to joins your Last.fm profile: a track counts once half of it played, or four minutes.">
          <Switch on={s.scrobbling} label="Scrobble to Last.fm" onChange={(v) => save({ scrobbling: v })} />
        </Row>
        <div class="mm-actions">
          <button
            type="button"
            class="mm-button mm-button-outline"
            onClick={async () => {
              if (!(await confirm("Disconnect Last.fm", "MixMusic forgets your Last.fm connection; your scrobbles stay on Last.fm.", "disconnect"))) return;
              await Accounts.lastfmLogout();
              await refreshAccounts();
            }}
          >
            disconnect
          </button>
        </div>
      </Group>
    );
  }
  return (
    <Group title="last.fm">
      <ol class="mm-steps">
        <li>
          Create an API account on{" "}
          <a href="https://www.last.fm/api/account/create" onClick={open("https://www.last.fm/api/account/create")}>
            Last.fm
          </a>
          ; any name and description will do, and the callback URL can stay empty.
        </li>
        <li>Paste its API key and shared secret here, and connect.</li>
        <li>Approve MixMusic on the page that opens in your browser.</li>
      </ol>
      <Row title="API key">
        <input class="mm-input" spellcheck={false} placeholder="32 letters and digits" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
      </Row>
      <Row title="Shared secret">
        <input class="mm-input" type="password" spellcheck={false} placeholder="32 letters and digits" value={secret} onInput={(e) => setSecret((e.target as HTMLInputElement).value)} />
      </Row>
      <div class="mm-actions">
        <button type="button" class="mm-button mm-button-primary" disabled={busy || !key.trim() || !secret.trim()} onClick={connect}>
          {busy ? "waiting for Last.fm…" : "connect to last.fm"}
        </button>
      </div>
      <p class="mm-hint">MixMusic keeps them in your system's credential store, with the connection.</p>
    </Group>
  );
}

// Plugins.

function PluginsTab({ s }: { s: SettingsData }) {
  const plugins = inventory.value.plugins;
  const toggle = async (p: Plugin, on: boolean) => {
    if (on && !p.builtin) {
      const perms = p.permissions?.length ? ` It asks for: ${p.permissions.join(", ")}.` : "";
      const ok = await confirm(
        `Enable ${p.name}`,
        `Plugins run inside MixMusic with everything MixMusic can do. Enable plugins from authors you trust.${perms}`,
        "enable",
      );
      if (!ok) return;
    }
    const set = new Set(s.enabledPlugins);
    if (on) set.add(p.id);
    else set.delete(p.id);
    await save({ enabledPlugins: [...set] });
  };
  return (
    <>
      <Group
        title="installed plugins"
        action={
          <div class="mm-actions">
            <button type="button" class="mm-text-button" onClick={() => navigate("/marketplace/plugins")}>
              get plugins
            </button>
            <button type="button" class="mm-text-button" onClick={() => Addons.openFolder("plugin")}>
              open plugins folder
            </button>
            <button type="button" class="mm-text-button" onClick={() => Addons.reload()}>
              reload
            </button>
          </div>
        }
      >
        {plugins.length === 0 && <p class="mm-hint">No plugins yet. The marketplace has some, and docs/plugins.md tells how to write one.</p>}
        {plugins.map((p) => (
          <Row
            key={p.id}
            title={`${p.name} ${p.version}`}
            description={
              <>
                {p.description} <span class="mm-muted">by {p.author}</span>
                {failures.value[p.id] && <span class="mm-hint-error"> · failed: {failures.value[p.id]}</span>}
              </>
            }
          >
            <div class="mm-actions">
              <Switch on={s.enabledPlugins.includes(p.id)} label={`Enable ${p.name}`} onChange={(on) => void toggle(p, on)} />
              {!p.builtin && (
                <button
                  type="button"
                  class="mm-icon-button"
                  aria-label={`Remove ${p.name}`}
                  onClick={async () => {
                    if (!(await confirm(`Remove ${p.name}`, "The plugin and its files are deleted; what it stored stays.", "remove", true))) return;
                    await save({ enabledPlugins: s.enabledPlugins.filter((id) => id !== p.id) });
                    await Addons.uninstall("plugin", p.id);
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          </Row>
        ))}
        {inventory.value.problems.filter((p) => p.kind === "plugin").map((p) => (
          <p class="mm-hint mm-hint-error" key={p.folder}>
            The plugin in “{p.folder}” did not load: {p.error}
          </p>
        ))}
      </Group>
    </>
  );
}

// The desktop.

function Desktop({ s }: { s: SettingsData }) {
  const login = useAsync(() => Preferences.openAtLogin(), []);
  return (
    <Group title="on the desktop">
      <Row title="Close to the tray" description="Closing the window keeps the music playing; quit from the tray icon.">
        <Switch on={s.closeToTray} label="Close to the tray" onChange={(v) => save({ closeToTray: v })} />
      </Row>
      <Row title="Media keys" description="The keyboard's play, next and previous keys control MixMusic.">
        <Switch on={s.mediaKeys} label="Media keys" onChange={(v) => save({ mediaKeys: v })} />
      </Row>
      <Row title="Notifications" description="Tell what starts playing while MixMusic is in the background.">
        <Switch on={s.notifications} label="Notifications" onChange={(v) => save({ notifications: v })} />
      </Row>
      <Row
        title="Show what plays on Discord"
        description="While Discord runs, your profile says what you listen to, with the artwork and the time left; pausing clears it."
      >
        <Switch on={s.discordPresence} label="Show what plays on Discord" onChange={(v) => save({ discordPresence: v })} />
      </Row>
      {s.discordPresence && <DiscordApp s={s} />}
      <Row title="Start at login">
        <Switch
          on={login.data ?? false}
          label="Start at login"
          onChange={(v) =>
            Preferences.setOpenAtLogin(v).then(
              () => login.set(v),
              (err) => toast(errorMessage(err), { tone: "error" }),
            )
          }
        />
      </Row>
      <Row title="Reset settings" description="Puts back the settings of a new install; your accounts, library and add-ons stay.">
        <button
          type="button"
          class="mm-button mm-button-outline"
          onClick={async () => {
            if (await confirm("Reset settings", "Put back every setting as it was on a new install?", "reset", true)) await Preferences.reset();
          }}
        >
          reset
        </button>
      </Row>
    </Group>
  );
}

/** YouTubeChannels chooses the channel of the account YouTube Music is used as, when it has more than one. */
function YouTubeChannels() {
  const channels = useAsync(() => Accounts.youTubeChannels(), []);
  const list = channels.data ?? [];
  if (list.length < 2) return null;
  const current = list.find((c) => c.current)?.pageId ?? "";
  return (
    <Row title="Channel" description="Brand channels of your account have their own home feed, library and likes.">
      <Select
        value={current}
        label="Channel"
        options={list.map((c) => ({ value: c.pageId ?? "", label: c.handle ? `${c.name} (${c.handle})` : c.name }))}
        onChange={async (pageId) => {
          try {
            await Accounts.setYouTubeChannel(pageId);
            await refreshAccounts();
            channels.reload();
            toast(`Using YouTube Music as ${list.find((c) => (c.pageId ?? "") === pageId)?.name ?? "that channel"}`, { tone: "success" });
          } catch (err) {
            toast(errorMessage(err), { tone: "error" });
          }
        }}
      />
    </Row>
  );
}

function DiscordApp({ s }: { s: SettingsData }) {
  const [id, setId] = useState(s.discordAppId);
  useEffect(() => setId(s.discordAppId), [s.discordAppId]);
  const url = "https://discord.com/developers/applications";
  return (
    <Row
      title="Discord application ID"
      description={
        <>
          Discord shows the name of an application: create one called MixMusic in the{" "}
          <a href={url} onClick={(e) => (e.preventDefault(), System.openExternal(url))}>
            developer portal
          </a>{" "}
          and paste its application ID.
        </>
      }
    >
      <input
        class="mm-input"
        inputMode="numeric"
        spellcheck={false}
        placeholder="18 digits or so"
        value={id}
        onInput={(e) => setId((e.target as HTMLInputElement).value)}
        onBlur={() => id.trim() !== s.discordAppId && save({ discordAppId: id.trim() })}
      />
    </Row>
  );
}

function Shortcuts({ s }: { s: SettingsData }) {
  const [recording, setRecording] = useState<string | null>(null);
  const chosen = s.shortcuts ?? {};
  const list = [...commands.value].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.title.localeCompare(b.title));

  const setKeys = (id: string, keys: string) => {
    const next = { ...chosen };
    // The command that had these keys gives them up.
    if (keys) {
      for (const c of commands.value) {
        if (c.id !== id && shortcutOf(c) === keys) {
          next[c.id] = "";
          toast(`${c.title} has no shortcut now`);
        }
      }
    }
    const own = commands.value.find((c) => c.id === id)?.shortcut ?? "";
    if (keys === own) delete next[id];
    else next[id] = keys;
    void save({ shortcuts: next });
  };

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      // While recording, keys name the shortcut instead of running commands.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") return setRecording(null);
      if (e.key === "Backspace" || e.key === "Delete") {
        setKeys(recording, "");
        return setRecording(null);
      }
      const keys = eventShortcut(e);
      if (!keys) return; // a modifier, waiting for its key
      setKeys(recording, keys);
      setRecording(null);
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [recording, chosen]);

  return (
    <Group
      title="keyboard shortcuts"
      action={
        Object.keys(chosen).length > 0 ? (
          <button type="button" class="mm-text-button" onClick={() => void save({ shortcuts: {} })}>
            reset all
          </button>
        ) : undefined
      }
    >
      <table class="mm-table mm-shortcuts">
        <thead>
          <tr>
            <th>command</th>
            <th>keys</th>
            <th>
              <span class="mm-visually-hidden">change</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const keys = shortcutOf(c);
            const isRecording = recording === c.id;
            return (
              <tr key={c.id} data-recording={isRecording || undefined}>
                <td>{c.title}</td>
                <td>
                  {isRecording ? (
                    <span class="mm-shortcut-recording" aria-live="polite">
                      press the keys · esc cancels · backspace removes
                    </span>
                  ) : keys ? (
                    <kbd class="mm-menu-shortcut">{shortcutLabel(keys)}</kbd>
                  ) : (
                    <span class="mm-muted">none</span>
                  )}
                </td>
                <td class="mm-shortcut-actions">
                  <button type="button" class="mm-text-button" onClick={() => setRecording(isRecording ? null : c.id)}>
                    {isRecording ? "cancel" : keys ? "change" : "set"}
                  </button>
                  {c.id in chosen && !isRecording && (
                    <button
                      type="button"
                      class="mm-text-button"
                      onClick={() => {
                        const { [c.id]: _, ...rest } = chosen;
                        void save({ shortcuts: rest });
                      }}
                    >
                      reset
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="mm-hint">
        Shortcuts with a single key work while you are not typing. The command palette, {shortcutLabel(shortcutOf(commands.value.find((c) => c.id === "view.palette") ?? { id: "", title: "", run: () => {} }) ?? "Mod+K")}, lists every command, those of plugins too.
      </p>
    </Group>
  );
}

function Updates() {
  const status = useAsync(() => System.updates(), []);
  useEffect(() => events.updatesChanged.on((u) => status.set(u)), []);
  const u = status.data;
  if (!u) return null;
  const set = (checks: boolean, downloads: boolean) =>
    System.setUpdates(checks, downloads).then(status.set, (err) => toast(errorMessage(err), { tone: "error" }));
  const last = u.lastCheck ? new Date(u.lastCheck).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <Group
      title="updates"
      action={
        u.enabled ? (
          <button type="button" class="mm-text-button" onClick={() => System.checkForUpdates()}>
            check now
          </button>
        ) : undefined
      }
    >
      {u.enabled ? (
        <>
          <Row title="Check for updates" description={last ? `Once a day. Last checked ${last}.` : "Once a day, from the releases on GitHub."}>
            <Switch on={u.automaticChecks} label="Check for updates" onChange={(v) => void set(v, u.automaticDownloads)} />
          </Row>
          <Row title="Install updates without asking" description="New versions download in the background and run at the next launch.">
            <Switch
              on={u.automaticChecks && u.automaticDownloads}
              label="Install updates without asking"
              onChange={(v) => void set(u.automaticChecks || v, v)}
            />
          </Row>
        </>
      ) : (
        <p class="mm-hint">
          This copy of MixMusic does not update itself: development builds, and the Debian package, which updates with the system's packages, do not. The installers and the Linux archive do.
        </p>
      )}
    </Group>
  );
}

function About() {
  const info = appInfo();
  const repo = "https://github.com/fzn0x/mixmusic";
  const open = (url: string) => (e: MouseEvent) => (e.preventDefault(), System.openExternal(url));
  return (
    <>
    <Updates />
    <Group title="mixmusic">
      <p class="mm-about-line">
        Version {info.version} · {info.platform} {info.arch}
        {info.dev ? " · development build" : ""}
      </p>
      <p class="mm-hint">
        Spotify and YouTube Music in one player, open source under the MIT license. Audio of YouTube Music comes through yt-dlp; synced lyrics from LRCLIB.
      </p>
      <div class="mm-actions">
        <a class="mm-button mm-button-outline" href={repo} onClick={open(repo)}>
          source code
        </a>
        <a class="mm-button mm-button-outline" href={`${repo}/issues`} onClick={open(`${repo}/issues`)}>
          report a problem
        </a>
        <a class="mm-button mm-button-outline" href={`${repo}/blob/main/CONTRIBUTING.md`} onClick={open(`${repo}/blob/main/CONTRIBUTING.md`)}>
          contribute
        </a>
      </div>
      <p class="mm-hint">Your data lives in {info.dataDir}.</p>
    </Group>
    </>
  );
}
