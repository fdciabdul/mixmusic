// After a crash, the next start offers to report it.
import { System } from "../mygo";
import { confirm } from "../state/ui";

/** offerCrashReport asks, when MixMusic crashed the time before, to report it on GitHub. */
export async function offerCrashReport(): Promise<void> {
  const report = await System.lastCrash().catch(() => "");
  if (!report) return;
  const send = await confirm(
    "MixMusic quit unexpectedly",
    `It kept a report of what happened, ${report}, in its logs folder. Reporting it on GitHub, with that file attached, helps fix it.`,
    "report it",
  );
  await System.dismissCrash();
  if (!send) return;
  await System.openExternal(await System.reportURL());
  await System.openLogsFolder().catch(() => {});
}
