// Form controls of the settings: switches, selects, rows and choice cards.
import type { ComponentChildren } from "preact";

/** Switch is a toggle button with the switch role. */
export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      class="mm-switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span class="mm-switch-track">
        <span class="mm-switch-thumb" />
      </span>
      <span class="mm-switch-state">{on ? "on" : "off"}</span>
    </button>
  );
}

interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  label: string;
  onChange: (value: T) => void;
}

export function Select<T extends string>({ value, options, label, onChange }: SelectProps<T>) {
  return (
    <select class="mm-select" aria-label={label} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Row lays out a setting: its name and what it does, then its control. */
export function Row({ title, description, children, stacked }: { title: string; description?: ComponentChildren; children: ComponentChildren; stacked?: boolean }) {
  return (
    <div class="mm-row" data-stacked={stacked || undefined}>
      <div class="mm-row-text">
        <span class="mm-row-title">{title}</span>
        {description && <span class="mm-row-description">{description}</span>}
      </div>
      <div class="mm-row-control">{children}</div>
    </div>
  );
}

/** Group titles a set of rows. */
export function Group({ title, children, action }: { title: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <section class="mm-group">
      <header class="mm-section-head">
        <h2 class="mm-section-title">{title.toLocaleLowerCase()}</h2>
        {action}
      </header>
      <div class="mm-group-body">{children}</div>
    </section>
  );
}

interface ChoiceProps<T extends string> {
  value: T;
  choices: { value: T; title: string; description: string }[];
  label: string;
  onChange: (value: T) => void;
}

/** Choices are large radio cards, for choices that need explaining. */
export function Choices<T extends string>({ value, choices, label, onChange }: ChoiceProps<T>) {
  return (
    <div class="mm-choices" role="radiogroup" aria-label={label}>
      {choices.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={c.value === value} class="mm-choice" onClick={() => onChange(c.value)}>
          <span class="mm-choice-title">{c.title}</span>
          <span class="mm-choice-description">{c.description}</span>
        </button>
      ))}
    </div>
  );
}
