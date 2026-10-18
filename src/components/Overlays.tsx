// What shows over the interface: the context menu, dialogs and toasts.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./Icon";
import { closeMenu, dialog, dismissToast, menu, toasts, type MenuItem } from "../state/ui";

export function ContextMenu() {
  const open = menu.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(open.x, innerWidth - r.width - 8);
    const y = open.y + r.height > innerHeight - 8 ? Math.max(8, open.y - r.height) : open.y;
    setPos({ x, y });
    ref.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && closeMenu();
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onDown, true);
    addEventListener("blur", closeMenu);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("pointerdown", onDown, true);
      removeEventListener("blur", closeMenu);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      class="mm-menu"
      role="menu"
      style={{ left: `${pos?.x ?? open.x}px`, top: `${pos?.y ?? open.y}px`, visibility: pos ? "visible" : "hidden" }}
      onKeyDown={moveFocus}
    >
      <MenuItems items={open.items} />
    </div>
  );
}

function MenuItems({ items }: { items: MenuItem[] }) {
  return (
    <>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} class="mm-menu-separator" role="separator" />
        ) : item.submenu ? (
          <div key={i} class="mm-menu-sub">
            <button type="button" role="menuitem" aria-haspopup="menu" class="mm-menu-item">
              <MenuIcon name={item.icon} />
              <span class="mm-ellipsis">{item.label}</span>
              <Icon name="chevronRight" size={14} class="mm-menu-arrow" />
            </button>
            <div class="mm-menu mm-submenu" role="menu">
              <MenuItems items={item.submenu} />
            </div>
          </div>
        ) : (
          <button
            key={i}
            type="button"
            role={item.checked != null ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.checked}
            class="mm-menu-item"
            data-danger={item.danger || undefined}
            disabled={item.disabled}
            onClick={() => {
              closeMenu();
              item.run?.();
            }}
          >
            {item.checked != null ? <MenuIcon name={item.checked ? "check" : undefined} /> : <MenuIcon name={item.icon} />}
            <span class="mm-ellipsis">{item.label}</span>
            {item.shortcut && <kbd class="mm-menu-shortcut">{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </>
  );
}

const knownIcons = new Set<string>([
  "play", "queue", "plus", "radio", "heart", "trash", "user", "disc", "external", "link", "refresh", "puzzle",
  "close", "library", "check", "download", "edit", "settings", "mini", "folder",
]);

function MenuIcon({ name }: { name?: string }) {
  return (
    <span class="mm-menu-icon">{name && knownIcons.has(name) ? <Icon name={name as IconName} size={16} /> : null}</span>
  );
}

/** moveFocus moves through menu items with the arrow keys. */
function moveFocus(e: KeyboardEvent) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const menuEl = (e.target as HTMLElement).closest(".mm-menu");
  if (!menuEl) return;
  const items = [...menuEl.querySelectorAll<HTMLButtonElement>(":scope > .mm-menu-item:not(:disabled), :scope > .mm-menu-sub > .mm-menu-item")];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
  next?.focus();
}

export function Dialog() {
  const d = dialog.value;
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!d) return;
    if (d.kind === "prompt") setValue(d.value);
    ref.current?.showModal();
  }, [d]);
  if (!d) return null;
  const close = (result: boolean) => {
    dialog.value = null;
    ref.current?.close();
    if (d.kind === "prompt") d.resolve(result ? value.trim() || null : null);
    else d.resolve(result);
  };
  return (
    <dialog ref={ref} class="mm-dialog" onCancel={(e) => (e.preventDefault(), close(false))}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          close(true);
        }}
      >
        <h2 class="mm-dialog-title">{d.title.toLocaleLowerCase()}</h2>
        {d.kind === "prompt" ? (
          <label class="mm-field">
            <span class="mm-field-label">{d.label}</span>
            <input
              class="mm-input"
              value={value}
              onInput={(e) => setValue((e.target as HTMLInputElement).value)}
              autoFocus
              onFocus={(e) => (e.target as HTMLInputElement).select()}
            />
          </label>
        ) : (
          <p class="mm-dialog-body">{d.body}</p>
        )}
        <div class="mm-dialog-actions">
          <button type="submit" class={`mm-button ${d.kind === "confirm" && d.danger ? "mm-button-danger" : "mm-button-primary"}`}>
            {d.confirm}
          </button>
          <button type="button" class="mm-button mm-button-outline" onClick={() => close(false)}>
            cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function Toasts() {
  return (
    <div class="mm-toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class="mm-toast" data-tone={t.tone}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="mm-text-button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" class="mm-icon-button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
