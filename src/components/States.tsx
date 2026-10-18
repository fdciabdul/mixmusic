// Loading, error and empty states.
import type { ComponentChildren } from "preact";
import { Icon } from "./Icon";

/** Loading shows rows of placeholders shaped like what loads. */
export function Loading({ rows = 8, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div class="mm-loading" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div class="mm-skeleton-row" style={{ animationDelay: `${i * 60}ms` }} key={i}>
          <span class="mm-skeleton mm-skeleton-square" />
          <span class="mm-skeleton mm-skeleton-line" style={{ width: `${40 + ((i * 37) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** LoadingTiles shows a row of placeholder tiles. */
export function LoadingTiles({ count = 6 }: { count?: number }) {
  return (
    <div class="mm-shelf-row" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div class="mm-art-tile" key={i}>
          <span class="mm-skeleton mm-art-frame" style={{ animationDelay: `${i * 80}ms` }} />
          <span class="mm-skeleton mm-skeleton-line" style={{ width: "70%", marginTop: "10px" }} />
        </div>
      ))}
    </div>
  );
}

interface ProblemProps {
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
  children?: ComponentChildren;
}

/** Problem tells what went wrong and how to get past it. */
export function Problem({ title, message, action, children }: ProblemProps) {
  return (
    <div class="mm-problem" role="alert">
      <Icon name="alert" size={28} />
      <div>
        <p class="mm-problem-title">{title}</p>
        {message && <p class="mm-problem-message">{message}</p>}
        {children}
        {action && (
          <button type="button" class="mm-button mm-button-outline" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** Empty invites the user to fill an empty place. */
export function Empty({ title, message, children }: { title: string; message?: string; children?: ComponentChildren }) {
  return (
    <div class="mm-empty">
      <p class="mm-empty-title">{title.toLocaleLowerCase()}</p>
      {message && <p class="mm-empty-message">{message}</p>}
      {children && <div class="mm-empty-actions">{children}</div>}
    </div>
  );
}
