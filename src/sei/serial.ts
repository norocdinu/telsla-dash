/** Runs async jobs one at a time, in the order they were queued. */
export function createSerial(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>) => {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  };
}
