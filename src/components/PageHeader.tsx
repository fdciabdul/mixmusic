// The page header: the page names itself in one giant light lowercase word
// that runs off the right edge of the pane. Scrolling the page slides the
// word left, bringing its cropped tail into view. Pivots below it switch
// the page's sections, the next one peeking from the edge.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface Pivot {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  title: string;
  pivots?: Pivot[];
  active?: string;
  onPivot?: (id: string) => void;
  /** children sit under the title: facts, actions. */
  children?: ComponentChildren;
}

export function PageHeader({ title, pivots, active, onPivot, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useTailReveal(ref);
  return (
    <header class="mm-page-header">
      <div class="mm-page-title-frame" ref={ref}>
        <h1 class="mm-page-title" title={title}>
          {title.toLocaleLowerCase()}
        </h1>
      </div>
      {children && <div class="mm-page-header-body">{children}</div>}
      {pivots && pivots.length > 0 && (
        <div class="mm-pivots" role="tablist" aria-label={`${title} sections`}>
          {pivots.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === active}
              class="mm-pivot"
              onClick={() => onPivot?.(p.id)}
            >
              {p.label}
              {p.count != null && <span class="mm-pivot-count mm-num">{p.count}</span>}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

/**
 * useTailReveal slides the title left as the page scrolls, up to the width
 * it overflows, so the cropped end of a long word comes into view.
 */
function useTailReveal(ref: { current: HTMLDivElement | null }) {
  useEffect(() => {
    const frame = ref.current;
    const scroller = frame?.closest<HTMLElement>(".mm-scroll");
    const title = frame?.firstElementChild as HTMLElement | null;
    if (!frame || !scroller || !title) return;
    let overflow = 0;
    const measure = () => {
      overflow = Math.max(0, title.scrollWidth - scroller.clientWidth + 48);
      frame.style.setProperty("--mm-title-overflow", `${overflow}px`);
    };
    const onScroll = () => {
      const progress = Math.min(1, scroller.scrollTop / 280);
      frame.style.setProperty("--mm-title-progress", String(progress));
    };
    measure();
    onScroll();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    ro.observe(title);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);
}
