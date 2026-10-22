import { describe, expect, test } from 'bun:test';
import type { DeleteResult } from '../../src/delete/types';
import { createDeleteFlow } from '../../src/ui/delete-flow';
import { flush } from '../helpers/engine-timelines';

function deps() {
  const runs: string[][] = [];
  return {
    runs,
    deps: {
      measure: async (ids: string[]) => ({ files: ids.length * 6, bytes: ids.length * 100 }),
      run: async (ids: string[]): Promise<DeleteResult[]> => {
        runs.push(ids);
        await new Promise((r) => setTimeout(r, 10));
        return ids.map((id) => ({ timelineId: id, deletedPaths: ['a'], failed: [], refused: false }));
      },
    },
  };
}

describe('the delete flow', () => {
  test('opening asks to confirm once the files are counted', async () => {
    const { deps: d } = deps();
    const flow = createDeleteFlow(d);
    flow.open(['a'], 'player');
    expect(flow.store.get().step).toBe('measuring');
    await flush();
    expect(flow.store.get()).toMatchObject({ step: 'confirm', measure: { files: 6, bytes: 100 } });
  });

  test('if the files cannot be counted, the dialog closes and says why', async () => {
    const { deps: d, runs } = deps();
    const flow = createDeleteFlow({ ...d, measure: () => Promise.reject(new Error('read failed')) });
    flow.open(['a'], 'player');
    await flush();
    expect(flow.store.get()).toMatchObject({ step: 'idle', message: { text: "Couldn't read the files to delete. Nothing was deleted.", left: [] } });
    expect(runs).toEqual([]);
  });

  test('opening another delete while one is showing changes nothing', async () => {
    const { deps: d } = deps();
    const flow = createDeleteFlow(d);
    flow.open(['a'], 'player');
    await flush();
    flow.open(['b'], 'list');
    await flush();
    expect(flow.store.get()).toMatchObject({ step: 'confirm', ids: ['a'], origin: 'player' });
  });

  test('cancelling deletes nothing', async () => {
    const { deps: d, runs } = deps();
    const flow = createDeleteFlow(d);
    flow.open(['a'], 'list');
    await flush();
    flow.cancel();
    expect(flow.store.get().step).toBe('idle');
    expect(runs).toEqual([]);
  });

  test('a double click on Delete runs one delete', async () => {
    const { deps: d, runs } = deps();
    const flow = createDeleteFlow(d);
    flow.open(['a'], 'player');
    await flush();
    void flow.confirm();
    void flow.confirm();
    await flush();
    expect(runs).toEqual([['a']]);
  });

  test('Delete does nothing before the files are counted', async () => {
    const { deps: d, runs } = deps();
    const flow = createDeleteFlow(d);
    flow.open(['a'], 'player');
    void flow.confirm();
    await flush();
    expect(runs).toEqual([]);
  });

  test('after the first permission is granted the browser warning is not shown again', async () => {
    const { deps: d } = deps();
    const flow = createDeleteFlow(d);
    expect(flow.store.get().firstTime).toBe(true);
    flow.open(['a'], 'player');
    await flush();
    await flow.confirm();
    expect(flow.store.get()).toMatchObject({ step: 'idle', firstTime: false, message: { text: 'Deleted 1 event, 0.1 GB.', left: [] } });
  });
});
