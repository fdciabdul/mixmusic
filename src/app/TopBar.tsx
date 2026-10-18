// The top bar: history arrows and the search box, under the window's own
// controls, dragging the window.
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { back, canGoBack, canGoForward, current, forward, href, navigate } from "../lib/router";
import { debounce } from "../lib/async";
import { Catalog } from "../mygo";
import { paletteOpen } from "../state/ui";
import { modKey } from "../lib/runtime";

export function TopBar() {
  return (
    <div class="mm-topbar">
      <div class="mm-history">
        <button type="button" class="mm-icon-button" disabled={!canGoBack.value} onClick={back} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <button type="button" class="mm-icon-button" disabled={!canGoForward.value} onClick={forward} aria-label="Forward">
          <Icon name="forward" size={18} />
        </button>
      </div>
      <SearchBox />
      <button type="button" class="mm-palette-button" onClick={() => (paletteOpen.value = true)} aria-label="Open the command palette">
        <Icon name="command" size={16} />
        <kbd>{modKey()} K</kbd>
      </button>
    </div>
  );
}

export const searchInputId = "mm-search";

function SearchBox() {
  const loc = current.value;
  const onSearch = loc.path === "/search";
  const [value, setValue] = useState(onSearch ? (loc.query.get("q") ?? "") : "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onSearch) setValue(loc.query.get("q") ?? "");
  }, [loc]);

  const suggest = useRef(
    debounce((q: string) => {
      Catalog.suggestions(q).then(
        (s) => setSuggestions(s.slice(0, 8)),
        () => setSuggestions([]),
      );
    }, 180),
  ).current;

  const submit = (q: string) => {
    setOpen(false);
    if (q.trim()) navigate(href.search(q.trim()), { replace: onSearch });
  };

  return (
    <div class="mm-search" ref={box} onFocusOut={(e) => !box.current?.contains(e.relatedTarget as Node) && setOpen(false)}>
      <Icon name="search" size={18} />
      <input
        id={searchInputId}
        class="mm-input-bare"
        type="search"
        aria-controls="mm-suggestions"
        aria-activedescendant={active >= 0 ? `mm-suggestion-${active}` : undefined}
        aria-autocomplete="list"
        placeholder="search spotify and youtube music"
        value={value}
        onFocus={() => {
          setOpen(true);
          suggest(value);
        }}
        onInput={(e) => {
          const q = (e.target as HTMLInputElement).value;
          setValue(q);
          setOpen(true);
          setActive(-1);
          suggest(q);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, suggestions.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, -1)));
          else if (e.key === "Enter") {
            e.preventDefault();
            const q = active >= 0 ? (suggestions[active] ?? value) : value;
            setValue(q);
            submit(q);
          } else if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <ul class="mm-suggestions mm-menu" id="mm-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s} id={`mm-suggestion-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                class="mm-menu-item"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue(s);
                  submit(s);
                }}
              >
                <span class="mm-menu-icon">
                  <Icon name="search" size={14} />
                </span>
                <span class="mm-ellipsis">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
