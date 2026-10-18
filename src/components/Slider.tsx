// Sliders: a native range input, drawn as a 2px line with the accent up to
// the value, so it keeps the keyboard and screen reader behavior of one.
interface Props {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  onInput: (value: number) => void;
  onCommit?: (value: number) => void;
  valueText?: string;
  class?: string;
  disabled?: boolean;
}

export function Slider({ value, min = 0, max = 1, step = 0.01, label, onInput, onCommit, valueText, class: cls, disabled }: Props) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      class={`mm-slider ${cls ?? ""}`}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ "--mm-fill": `${Math.max(0, Math.min(100, pct))}%` }}
      onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))}
      onChange={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      disabled={disabled}
    />
  );
}
