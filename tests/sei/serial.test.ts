import { describe, expect, test } from 'bun:test';
import { createSerial } from '../../src/sei/serial';

describe('createSerial', () => {
  test('runs one job at a time, in order', async () => {
    const run = createSerial();
    let active = 0;
    let most = 0;
    const order: number[] = [];
    const job = (n: number) => async () => {
      active++;
      most = Math.max(most, active);
      await new Promise((r) => setTimeout(r, 5));
      order.push(n);
      active--;
      return n;
    };
    const results = await Promise.all([run(job(1)), run(job(2)), run(job(3))]);
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(most).toBe(1);
  });

  test('a failing job does not stop the next one', async () => {
    const run = createSerial();
    const failed = run(async () => {
      throw new Error('boom');
    });
    await expect(failed).rejects.toThrow('boom');
    expect(await run(async () => 'next')).toBe('next');
  });
});
