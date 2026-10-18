// The pages plugins add, and the page of paths nothing answers.
import { useEffect, useRef } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { Empty } from "../components/States";
import { pluginPages } from "../plugins/contributions";
import { navigate } from "../lib/router";

export function PluginPage({ path }: { path: string }) {
  const page = pluginPages.value.find((p) => p.path === path);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!page || !ref.current) return;
    const el = ref.current;
    try {
      const cleanup = page.render(el);
      return () => {
        if (typeof cleanup === "function") cleanup();
        el.replaceChildren();
      };
    } catch (err) {
      el.textContent = `This page failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, [page]);
  if (!page) return <NotFound />;
  return (
    <div class="mm-page">
      <PageHeader title={page.title} />
      <div class="mm-plugin-page" data-plugin={page.plugin} ref={ref} />
    </div>
  );
}

export function NotFound() {
  return (
    <div class="mm-page">
      <PageHeader title="lost" />
      <Empty title="nothing lives here" message="This page may belong to a plugin that is not enabled.">
        <button type="button" class="mm-button mm-button-primary" onClick={() => navigate("/")}>
          go home
        </button>
      </Empty>
    </div>
  );
}
