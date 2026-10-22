import { describe, expect, mock, test } from 'bun:test';
import { TelemetryCache } from '../../src/sei/telemetry-cache';
import { fakeSource } from '../helpers/sources';
import { makeTrack } from '../helpers/track-builder';

describe('TelemetryCache', () => {
  test('two concurrent gets load once', async () => {
    const load = mock(async () => makeTrack(3, 36));
    const cache = new TelemetryCache(load);
    const a = fakeSource('a.mp4');
    const [x, y] = await Promise.all([cache.get(a), cache.get(a)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(x).toBe(y);
    expect(cache.peek(a)).toBe(x);
  });

  test('evicts the least recently used beyond the limit', async () => {
    const cache = new TelemetryCache(async () => makeTrack(3, 36), 2);
    const [a, b, c] = ['a.mp4', 'b.mp4', 'c.mp4'].map((p) => fakeSource(p));
    await cache.get(a);
    await cache.get(b);
    await cache.get(c);
    expect(cache.peek(a)).toBeUndefined();
    expect(cache.peek(b)).toBeDefined();
    expect(cache.peek(c)).toBeDefined();
  });

  test('peek keeps an entry recent', async () => {
    const cache = new TelemetryCache(async () => makeTrack(3, 36), 2);
    const [a, b, c] = ['a.mp4', 'b.mp4', 'c.mp4'].map((p) => fakeSource(p));
    await cache.get(a);
    await cache.get(b);
    cache.peek(a);
    await cache.get(c);
    expect(cache.peek(a)).toBeDefined();
    expect(cache.peek(b)).toBeUndefined();
  });

  test('pending shares a load in flight or done, without starting one', async () => {
    const load = mock(async () => makeTrack(3, 36));
    const cache = new TelemetryCache(load);
    const a = fakeSource('a.mp4');
    expect(cache.pending(a)).toBeUndefined();
    const p = cache.get(a);
    expect(cache.pending(a)).toBe(p);
    await p;
    expect(await cache.pending(a)).toBe(await p);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('remembers failures until cleared', async () => {
    const cache = new TelemetryCache(async () => {
      throw new Error('boom');
    });
    const a = fakeSource('a.mp4');
    await cache.get(a).catch(() => undefined);
    expect(cache.failed(a)).toBe(true);
    cache.clear();
    expect(cache.failed(a)).toBe(false);
  });

  test('failed loads are retried on the next get', async () => {
    let calls = 0;
    const cache = new TelemetryCache(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return makeTrack(3, 36);
    });
    const a = fakeSource('a.mp4');
    await expect(cache.get(a)).rejects.toThrow('boom');
    expect(cache.peek(a)).toBeUndefined();
    await expect(cache.get(a)).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
});
