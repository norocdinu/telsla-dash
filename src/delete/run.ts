import type { DeletePlan, DeleteResult, DirRef } from './types';

export interface RunProgress {
  event: number;
  events: number;
  file: number;
  files: number;
}

/** How long to wait before trying a file again that was in use (a video let go of a moment ago). */
const RETRY_MS = 250;

const isNamed = (e: unknown, name: string) => e instanceof DOMException && e.name === name;
const reasonOf = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks once per root, in order, for permission to edit; a root that throws counts as refused. Roots already in
 * `granted` aren't asked again. Call it first thing after the click on Delete: browsers only show the prompt then.
 */
export async function askWrite(plans: DeletePlan[], granted = new Map<string, boolean>()): Promise<Map<string, boolean>> {
  const answers = new Map(granted);
  for (const plan of plans) {
    for (const root of plan.roots) {
      if (answers.has(root.id)) continue;
      let ok: boolean;
      try {
        ok = await root.requestWrite();
      } catch {
        ok = false;
      }
      answers.set(root.id, ok);
    }
  }
  return answers;
}

/** Removes one entry; the error, or null when it is gone (already gone counts). */
async function tryRemove(dir: DirRef, name: string): Promise<unknown> {
  try {
    await dir.removeEntry(name);
    return null;
  } catch (e) {
    return isNamed(e, 'NotFoundError') ? null : e;
  }
}

/**
 * Deletes the plans in order. Edit permission is asked once per root (unless already `granted`) before anything
 * is removed; plans under a refused root are left untouched. A file that is already gone counts as deleted; a
 * file that fails is tried once more (once per event), then reported, and the plan carries on. Stopping (the
 * signal) takes effect between plans, never in the middle of one.
 */
export async function runDelete(
  plans: DeletePlan[],
  onProgress: (p: RunProgress) => void,
  signal: AbortSignal,
  granted?: Map<string, boolean>,
): Promise<DeleteResult[]> {
  const allowed = await askWrite(plans, granted);

  const results: DeleteResult[] = [];
  for (const [n, plan] of plans.entries()) {
    if (signal.aborted) break;
    const result: DeleteResult = { timelineId: plan.timeline.id, deletedPaths: [], failed: [], refused: false };
    if (plan.roots.some((r) => !allowed.get(r.id))) {
      result.refused = true;
      results.push(result);
      continue;
    }
    const fileSteps = plan.steps.filter((s) => s.kind === 'file').length;
    let done = 0;
    let retried = false;
    for (const step of plan.steps) {
      if (step.kind === 'file') {
        let error = await tryRemove(step.dir, step.name);
        if (error && !retried) {
          retried = true;
          await wait(RETRY_MS);
          error = await tryRemove(step.dir, step.name);
        }
        if (error) result.failed.push({ path: step.path, reason: reasonOf(error) });
        else result.deletedPaths.push(step.path);
        onProgress({ event: n + 1, events: plans.length, file: ++done, files: fileSteps });
      } else {
        try {
          await step.dir.removeEntry(step.name);
        } catch (e) {
          // Not empty (something the app doesn't know about is still in it) or already gone: leave it.
          if (!isNamed(e, 'InvalidModificationError') && !isNamed(e, 'NotFoundError')) {
            result.failed.push({ path: step.name, reason: reasonOf(e) });
          }
        }
      }
    }
    results.push(result);
  }
  return results;
}
