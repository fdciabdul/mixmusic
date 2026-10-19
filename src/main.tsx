// MixMusic's frontend: it loads what the Go side knows, applies the theme,
// starts the player and the plugins, and renders the app, or the mini
// player in its own window.
import { render } from "preact";
import { events } from "./mygo";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/pages.css";
import { App } from "./app/App";
import { Mini } from "./pages/Mini";
import { loadInfo } from "./lib/runtime";
import { loadSettings, settings, update } from "./state/settings";
import { loadAccounts } from "./state/accounts";
import { loadLibrary } from "./state/library";
import { initTheme, loadInventory, themePatch, themes } from "./theme/theme";
import { currentTrack, initPlayer } from "./player/player";
import { initPlugins } from "./plugins/host";
import { initShortcuts, registerCommand } from "./lib/commands";
import { registerBuiltinCommands } from "./app/commands";
import { navigate } from "./lib/router";
import { artwork, errorMessage } from "./lib/format";
import { createAPI } from "./plugins/api";
import { effect } from "@preact/signals";
import { offerCrashReport } from "./lib/crash";

async function boot(): Promise<void> {
  const root = document.getElementById("app")!;
  const mini = location.pathname === "/mini";
  try {
    await loadInfo();
    await Promise.all([loadSettings(), loadInventory()]);
    initTheme(() => artwork(currentTrack.value?.artwork, 120));
    if (mini) {
      render(<Mini />, root);
      return;
    }
    await Promise.all([loadAccounts(), loadLibrary()]);
    initPlayer();
    registerBuiltinCommands();
    effect(() => {
      // Theme commands follow the themes installed.
      for (const t of themes.value) {
        registerCommand({ id: `theme.${t.id}`, title: `Theme: ${t.name}`, group: "themes", run: () => void update(themePatch(settings.value, t.id)) });
      }
    });
    initShortcuts();
    initPlugins();
    events.navigate.on((path) => navigate(path));
    exposeConsoleAPI();
    render(<App />, root);
    void offerCrashReport();
  } catch (err) {
    root.innerHTML = "";
    const p = document.createElement("p");
    p.className = "mm-boot-error";
    p.textContent = `MixMusic could not start: ${errorMessage(err)}`;
    root.append(p);
    throw err;
  }
}

/** exposeConsoleAPI gives plugin authors the plugin API in the web inspector, as `mixmusic`. */
function exposeConsoleAPI(): void {
  Object.defineProperty(window, "mixmusic", {
    configurable: true,
    get: () => createAPI("console", []),
  });
}

void boot();
