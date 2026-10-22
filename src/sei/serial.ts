export interface Serial {
  <T>(job: () => Promise<T>): Promise<T>;
  /** Resolves once every job queued so far has finished. */
  idle(): Promise<void>;
}

/** Runs async jobs one at a time, in the order they were queued. */
export function createSerial(): Serial {
  let tail: Promise<unknown> = Promise.resolve();
  const run = (<T>(job: () => Promise<T>) => {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  }) as Serial;
  run.idle = () => tail.then(() => undefined);
  return run;
}
