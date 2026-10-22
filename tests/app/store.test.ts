import { describe, expect, test } from 'bun:test';
import { createStore } from '../../src/app/store';

describe('createStore', () => {
  test('set merges and notifies once per call', () => {
    const s = createStore({ a: 1, b: 2 });
    let calls = 0;
    s.subscribe(() => calls++);
    s.set({ a: 5 });
    s.set((st) => ({ b: st.a + 1 }));
    expect(s.get()).toEqual({ a: 5, b: 6 });
    expect(calls).toBe(2);
  });

  test('unsubscribe stops notifications', () => {
    const s = createStore({ a: 1 });
    let calls = 0;
    const off = s.subscribe(() => calls++);
    off();
    s.set({ a: 2 });
    expect(calls).toBe(0);
  });
});
