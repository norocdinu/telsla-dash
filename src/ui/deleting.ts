// The app's delete flow, wired to the real library and deleter.
import { deleteTimelines, plansFor } from '../app/delete';
import { measurePlan } from '../delete/plan';
import { createDeleteFlow } from './delete-flow';

export const deleteFlow = createDeleteFlow({
  async measure(ids) {
    const perId = new Map<string, number>();
    let files = 0;
    let bytes = 0;
    for (const plan of plansFor(ids)) {
      const m = await measurePlan(plan);
      perId.set(plan.timeline.id, m.bytes);
      files += m.files;
      bytes += m.bytes;
    }
    return { files, bytes, perId };
  },
  run: deleteTimelines,
});

/** Whether every one of these can be deleted (opened with Choose folder or dragged in, in Chrome or Edge). */
export function canDelete(ids: string[]): boolean {
  return ids.length > 0 && plansFor(ids).length === ids.length;
}
