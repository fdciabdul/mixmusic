// The command palette: every command, and a search, one keystroke away.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { commands, shortcutLabel, type Command } from "../lib/commands";
import { paletteOpen } from "../state/ui";
import { href, navigate } from "../lib/router";
import { Icon } from "./Icon";

export function CommandPalette() {
  const open = paletteOpen.value;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      ref.current?.showModal();
    } else ref.current?.close();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Command[] = commands.value
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.group?.includes(q))
      .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.title.localeCompare(b.title));
    if (q) list.unshift({ id: "search", title: `Search for “${query.trim()}”`, group: "search", run: () => navigate(href.search(query.trim())) });
    return list.slice(0, 50);
  }, [query, commands.value]);

  const close = () => (paletteOpen.value = false);
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  return (
    <dialog
      ref={ref}
      class="mm-palette"
      onCancel={(e) => (e.preventDefault(), close())}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div class="mm-palette-box">
        <label class="mm-palette-input">
          <Icon name="command" size={18} />
          <input
            class="mm-input-bare"
            placeholder="type a command or search music"
            value={query}
            autoFocus
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
              else if (e.key === "Enter") (e.preventDefault(), run(results[active]));
            }}
            aria-label="Command"
            aria-controls="mm-palette-list"
          />
        </label>
        <ul class="mm-palette-list" id="mm-palette-list" role="listbox">
          {results.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              class="mm-palette-item"
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span class="mm-palette-group">{c.group}</span>
              <span class="mm-ellipsis">{c.title}</span>
              {c.shortcut && <kbd class="mm-menu-shortcut">{shortcutLabel(c.shortcut)}</kbd>}
            </li>
          ))}
          {results.length === 0 && <li class="mm-palette-empty">No command matches.</li>}
        </ul>
      </div>
    </dialog>
  );
}
