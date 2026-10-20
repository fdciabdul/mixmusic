// The offer of a new version. MixMusic looks for one at start and every few
// hours, and unless it installs new versions without asking, asks here.
import { useEffect, useRef, useState } from "preact/hooks";
import { Channel } from "mygo-runtime";
import { Icon } from "../components/Icon";
import { events, System, type InstallProgress, type Release, type UpdateStatus } from "../mygo";
import { appInfo } from "../lib/runtime";
import { errorMessage } from "../lib/format";
import { navigate } from "../lib/router";
import { downloads, replacing } from "../pages/Settings";
import { toast } from "../state/ui";

export function UpdateOffer() {
  const [offer, setOffer] = useState<Release | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    System.updateOffer().then((r) => r && setOffer(r), () => {});
    System.updates().then(setStatus, () => {});
    const offs = [events.updateOffered.on(setOffer), events.updatesChanged.on(setStatus)];
    return () => offs.forEach((off) => off());
  }, []);

  const shown = !!offer && !!status;
  useEffect(() => {
    if (shown && !ref.current?.open) ref.current?.showModal();
  }, [shown]);

  if (!offer || !status) return null;

  /** dismiss closes the offer: later offers it again at the next start, skip never. */
  const dismiss = (skip = false) => {
    ref.current?.close();
    setOffer(null);
    System.dismissUpdate(skip).catch((err) => toast(errorMessage(err), { tone: "error" }));
  };
  const open = (url: string) => (e: MouseEvent) => (e.preventDefault(), System.openExternal(url));

  const install = async () => {
    setInstalling(true);
    try {
      const version = await System.installUpdate(new Channel<InstallProgress>((p) => setProgress(p)));
      // Put off while it downloaded, the offer says so in a toast.
      if (!ref.current?.open) {
        toast(`MixMusic ${version} is installed. It runs once MixMusic restarts.`, {
          tone: "success",
          action: { label: "restart now", run: () => System.restart() },
        });
      }
    } catch (err) {
      toast(`Couldn't install the update: ${errorMessage(err)}`, { tone: "error" });
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  };
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  const installed = status.installed === offer.version;

  return (
    <dialog ref={ref} class="mm-dialog mm-update-offer" aria-live="polite" onCancel={(e) => (e.preventDefault(), dismiss())}>
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 class="mm-dialog-title">mixmusic {offer.version} is out</h2>
        {installed ? (
          <p class="mm-dialog-body">It is installed, and runs once MixMusic restarts.</p>
        ) : (
          <>
            {offer.notes && <p class="mm-dialog-body">{offer.notes}</p>}
            <p class="mm-hint">
              You have {appInfo().version}.{" "}
              {status.enabled ? (
                <>
                  To install new versions without this question, turn on install updates without asking in{" "}
                  <a href="/settings/about" onClick={(e) => (e.preventDefault(), dismiss(), navigate("/settings/about"))}>
                    settings › about
                  </a>
                  .
                </>
              ) : (
                replacing(status.kind, offer.file)
              )}
            </p>
          </>
        )}
        <div class="mm-dialog-actions">
          {installed ? (
            <button type="button" class="mm-button mm-button-primary" onClick={() => System.restart()}>
              restart now
            </button>
          ) : status.enabled ? (
            <button type="button" class="mm-button mm-button-primary" disabled={installing} onClick={install} autoFocus>
              <Icon name="download" size={16} />
              {installing ? (pct != null ? `downloading ${pct}%` : "downloading…") : `install ${offer.version}`}
            </button>
          ) : (
            offer.download && (
              <a class="mm-button mm-button-primary" href={offer.download} onClick={open(offer.download)}>
                <Icon name="download" size={16} />
                {downloads[status.kind] ?? "download it"}
              </a>
            )
          )}
          {!installed && (
            <a class="mm-button mm-button-outline" href={offer.page} onClick={open(offer.page)}>
              what's new
            </a>
          )}
          <button type="button" class="mm-button mm-button-outline" onClick={() => dismiss()}>
            later
          </button>
          {!installed && !installing && (
            <button type="button" class="mm-text-button" onClick={() => dismiss(true)}>
              skip this version
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
