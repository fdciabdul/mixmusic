// The marketplace: themes and plugins of the community registry.
import { useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { Loading, Problem } from "../components/States";
import { Icon } from "../components/Icon";
import { Addons, System, type Entry, type Kind } from "../mygo";
import { useAsync } from "../lib/async";
import { navigate } from "../lib/router";
import { errorMessage } from "../lib/format";
import { inventory } from "../theme/theme";
import { update, settings } from "../state/settings";
import { confirm, toast } from "../state/ui";

const repo = "https://github.com/fzn0x/mixmusic";

export function Marketplace({ tab }: { tab?: string }) {
  const kind: Kind = tab === "plugins" ? "plugin" : "theme";
  const registry = useAsync(() => Addons.registry(false), []);
  const entries = kind === "theme" ? (registry.data?.themes ?? []) : (registry.data?.plugins ?? []);
  return (
    <div class="mm-page">
      <PageHeader
        title="marketplace"
        active={kind === "theme" ? "themes" : "plugins"}
        onPivot={(id) => navigate(`/marketplace/${id}`, { replace: true })}
        pivots={[
          { id: "themes", label: "themes", count: registry.data?.themes.length },
          { id: "plugins", label: "plugins", count: registry.data?.plugins.length },
        ]}
      >
        <p class="mm-hint">
          Made by the community, reviewed in the open.{" "}
          <a href={`${repo}/blob/main/CONTRIBUTING.md`} onClick={(e) => (e.preventDefault(), System.openExternal(`${repo}/blob/main/CONTRIBUTING.md`))}>
            Share yours
          </a>
          .
        </p>
      </PageHeader>
      {registry.loading && !registry.data && <Loading rows={6} label="Loading the registry" />}
      {registry.error && (
        <Problem
          title="Couldn't reach the community registry"
          message={registry.error}
          action={{ label: "try again", run: () => Addons.registry(true).then(registry.set, () => registry.reload()) }}
        />
      )}
      {registry.data && (
        <div class="mm-market-grid">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} kind={kind} baseUrl={registry.data!.baseUrl} />
          ))}
          {entries.length === 0 && <p class="mm-empty-line">Nothing here yet: be the first to share one.</p>}
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, kind, baseUrl }: { entry: Entry; kind: Kind; baseUrl: string }) {
  const [busy, setBusy] = useState(false);
  const installed =
    kind === "theme" ? inventory.value.themes.find((t) => t.id === entry.id) : inventory.value.plugins.find((p) => p.id === entry.id);
  const builtin = installed?.builtin ?? false;
  const outdated = installed && !builtin && installed.version !== entry.version;
  const c = entry.colors ?? {};

  const install = async () => {
    if (kind === "plugin") {
      const perms = entry.permissions?.length ? ` It asks for: ${entry.permissions.join(", ")}.` : "";
      if (!(await confirm(`Install ${entry.name}`, `Plugins run inside MixMusic with everything MixMusic can do. Install plugins from authors you trust.${perms}`, "install"))) return;
    }
    setBusy(true);
    try {
      await Addons.install(kind, entry.id);
      toast(`${outdated ? "Updated" : "Installed"} ${entry.name}`, {
        tone: "success",
        action:
          kind === "theme"
            ? { label: "use it", run: () => void update({ theme: entry.id }) }
            : { label: "enable", run: () => void update({ enabledPlugins: [...new Set([...(settings.value?.enabledPlugins ?? []), entry.id])] }) },
      });
    } catch (err) {
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      if (kind === "theme" && settings.value?.theme === entry.id) await update({ theme: "mix" });
      if (kind === "plugin") await update({ enabledPlugins: (settings.value?.enabledPlugins ?? []).filter((id) => id !== entry.id) });
      await Addons.uninstall(kind, entry.id);
      toast(`Removed ${entry.name}`);
    } catch (err) {
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article class="mm-market-card">
      {kind === "theme" ? (
        <div class="mm-market-preview" style={{ background: c["bg"], color: c["text"] }} aria-hidden="true">
          {entry.preview ? (
            <img src={`${baseUrl}${entry.path}/${entry.preview}`} alt="" loading="lazy" />
          ) : (
            <span class="mm-theme-tiles">
              {["tile-1", "tile-2", "tile-3", "tile-4"].map((k) => (
                <span key={k} style={{ background: c[k] }} />
              ))}
            </span>
          )}
        </div>
      ) : (
        <div class="mm-market-preview mm-market-plugin" aria-hidden="true">
          <Icon name="puzzle" size={40} />
        </div>
      )}
      <div class="mm-market-body">
        <h3 class="mm-market-name">{entry.name.toLocaleLowerCase()}</h3>
        <p class="mm-market-meta">
          {entry.version} · by {entry.author}
        </p>
        {entry.description && <p class="mm-market-description">{entry.description}</p>}
        {entry.permissions && entry.permissions.length > 0 && <p class="mm-market-meta">asks for {entry.permissions.join(", ")}</p>}
        <div class="mm-actions">
          {builtin ? (
            <span class="mm-hint">built in</span>
          ) : installed && !outdated ? (
            <button type="button" class="mm-button mm-button-outline" disabled={busy} onClick={remove}>
              remove
            </button>
          ) : (
            <button type="button" class="mm-button mm-button-primary" disabled={busy} onClick={install}>
              {busy ? "installing…" : outdated ? `update to ${entry.version}` : "install"}
            </button>
          )}
          {installed && kind === "theme" && settings.value?.theme !== entry.id && (
            <button type="button" class="mm-text-button" onClick={() => void update({ theme: entry.id })}>
              use it
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
