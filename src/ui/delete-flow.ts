// The confirm-then-delete flow shared by the player, the clip list and Manage events.
import type { DeleteOrigin } from '../app/delete';
import { createStore, type Store } from '../app/store';
import type { RunProgress } from '../delete/run';
import type { DeleteResult } from '../delete/types';
import { DELETE } from '../app/messages';
import { resultText, type ResultMessage } from './delete-text';

export interface Measure {
  files: number;
  bytes: number;
  /** Size per timeline id, for reporting what was actually deleted. */
  perId?: Map<string, number>;
}

export interface FlowState {
  step: 'idle' | 'measuring' | 'confirm' | 'running';
  ids: string[];
  origin: DeleteOrigin;
  measure: Measure | null;
  progress: RunProgress | null;
  /** True until edit permission has been granted once this session (the dialog warns about the prompt). */
  firstTime: boolean;
  /** The last result, shown after a delete (until dismissed when events were left). */
  message: ResultMessage | null;
}

const note = (text: string): ResultMessage => ({ text, left: [] });

export interface FlowDeps {
  measure(ids: string[]): Promise<Measure>;
  run(ids: string[], origin: DeleteOrigin, onProgress: (p: RunProgress) => void, signal: AbortSignal): Promise<DeleteResult[]>;
}

export function createDeleteFlow(deps: FlowDeps) {
  const store: Store<FlowState> = createStore<FlowState>({
    step: 'idle',
    ids: [],
    origin: 'player',
    measure: null,
    progress: null,
    firstTime: true,
    message: null,
  });
  let opened = 0;
  let abort: AbortController | null = null;

  return {
    store,

    /** Opens the confirmation for these ids; Delete is enabled once the files are counted. Never replaces one already open. */
    open(ids: string[], origin: DeleteOrigin) {
      if (store.get().step !== 'idle') return;
      const token = ++opened;
      store.set({ step: 'measuring', ids, origin, measure: null, progress: null });
      deps.measure(ids).then(
        (measure) => {
          if (token === opened && store.get().step === 'measuring') store.set({ step: 'confirm', measure });
        },
        () => {
          if (token === opened) store.set({ step: 'idle', message: note(DELETE.uncounted) });
        },
      );
    },

    cancel() {
      const { step } = store.get();
      if (step === 'measuring' || step === 'confirm') {
        opened++;
        store.set({ step: 'idle' });
      }
    },

    /** Runs the delete; does nothing unless the dialog is showing counted files (so never twice). */
    async confirm(): Promise<void> {
      const s = store.get();
      if (s.step !== 'confirm') return;
      abort = new AbortController();
      store.set({ step: 'running', progress: null });
      let results: DeleteResult[];
      try {
        results = await deps.run(s.ids, s.origin, (progress) => store.set({ progress }), abort.signal);
      } catch {
        store.set({ step: 'idle', progress: null, message: note(DELETE.error) });
        return;
      } finally {
        abort = null;
      }
      const fullyDeleted = results.filter((r) => !r.refused && !r.failed.length);
      const bytes = s.measure?.perId
        ? fullyDeleted.reduce((sum, r) => sum + (s.measure!.perId!.get(r.timelineId) ?? 0), 0)
        : fullyDeleted.length === s.ids.length
          ? (s.measure?.bytes ?? 0)
          : 0;
      store.set({
        step: 'idle',
        progress: null,
        firstTime: s.firstTime && results.every((r) => r.refused),
        message: results.length ? resultText(results, bytes) : null,
      });
    },

    /** Finishes the event being deleted, then stops (bulk deletes). */
    stop() {
      abort?.abort();
    },

    dismissMessage() {
      store.set({ message: null });
    },
  };
}

export type DeleteFlow = ReturnType<typeof createDeleteFlow>;
