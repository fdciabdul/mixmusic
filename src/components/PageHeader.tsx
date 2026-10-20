// The page header: the page names itself in one giant light lowercase word.
// The word and the pivots under it, which switch the page's sections,
// shrink to fit the pane on one line; past a floor, they wrap instead, so
// nothing is ever cut off.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pivotsRef = useRef<HTMLDivElement>(null);
  const hasPivots = !!pivots && pivots.length > 0;
  // A long name wraps small, the pivots at their full size.
  useFit(titleRef, 0.45, 0.45, true);
  useFit(pivotsRef, 0.85, 1, hasPivots);
  return (
    <header class="mm-page-header">
      <div class="mm-page-title-frame">
        <h1 class="mm-page-title" title={title} ref={titleRef}>
          {title.toLocaleLowerCase()}
        </h1>
      </div>
      {children && <div class="mm-page-header-body">{children}</div>}
      {hasPivots && (
        <div class="mm-pivots" role="tablist" aria-label={`${title} sections`} ref={pivotsRef}>
          {pivots!.map((p) => (
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
 * useFit scales the text of an element down, through --mm-fit, until one
 * line of it fits the width of its parent. Below min, the smallest scale,
 * it sets data-wrap instead, and the element wraps at the scale wrap. It
 * fits again when the pane resizes, a font loads, or the text, the text
 * size or the theme change the element's size. shown is whether the
 * element is rendered.
 */
function useFit(ref: { current: HTMLElement | null }, min: number, wrap: number, shown: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      // One line at the full size, as wide as its text.
      el.style.setProperty("--mm-fit", "1");
      el.removeAttribute("data-wrap");
      const natural = el.scrollWidth;
      const room = box.clientWidth - 1;
      const scale = natural > room && natural > 0 ? room / natural : 1;
      if (scale >= min) {
        el.style.setProperty("--mm-fit", String(Math.floor(scale * 1000) / 1000));
      } else {
        el.style.setProperty("--mm-fit", String(wrap));
        el.setAttribute("data-wrap", "");
      }
    };
    const later = () => {
      frame ||= requestAnimationFrame(fit);
    };
    fit();
    const resized = new ResizeObserver(later);
    resized.observe(box);
    resized.observe(el);
    const changed = new MutationObserver(later);
    changed.observe(el, { childList: true, characterData: true, subtree: true });
    document.fonts?.addEventListener("loadingdone", later);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      changed.disconnect();
      document.fonts?.removeEventListener("loadingdone", later);
    };
  }, [shown]);
}
