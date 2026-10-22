import type { SourceFile } from '../library/types';
import type { TelemetryTrack } from './telemetry';

/**
 * Keeps the driving data of recently watched files. Concurrent requests share one load.
 * Failures aren't kept as data, but are remembered so callers don't ask again every frame.
 */
export class TelemetryCache {
  private readonly done = new Map<string, TelemetryTrack>();
  private readonly loading = new Map<string, Promise<TelemetryTrack>>();
  private readonly failures = new Set<string>();
  private readonly load: (f: SourceFile) => Promise<TelemetryTrack>;
  private readonly maxEntries: number;

  constructor(load: (f: SourceFile) => Promise<TelemetryTrack>, maxEntries = 24) {
    this.load = load;
    this.maxEntries = maxEntries;
  }

  /** The cached track, marked as recently used. */
  peek(f: SourceFile): TelemetryTrack | undefined {
    const hit = this.done.get(f.path);
    if (hit) {
      this.done.delete(f.path);
      this.done.set(f.path, hit);
    }
    return hit;
  }

  /** A load already done or in flight, without starting one. */
  pending(f: SourceFile): Promise<TelemetryTrack> | undefined {
    const hit = this.done.get(f.path);
    return hit ? Promise.resolve(hit) : this.loading.get(f.path);
  }

  /** Whether the last load of this file failed. */
  failed(f: SourceFile): boolean {
    return this.failures.has(f.path);
  }

  get(f: SourceFile): Promise<TelemetryTrack> {
    const hit = this.peek(f);
    if (hit) return Promise.resolve(hit);
    const pending = this.loading.get(f.path);
    if (pending) return pending;
    const p = this.load(f).then(
      (track) => {
        this.loading.delete(f.path);
        this.failures.delete(f.path);
        this.done.set(f.path, track);
        while (this.done.size > this.maxEntries) this.done.delete(this.done.keys().next().value!);
        return track;
      },
      (err) => {
        this.loading.delete(f.path);
        this.failures.add(f.path);
        throw err;
      },
    );
    this.loading.set(f.path, p);
    return p;
  }

  /** Forgets everything, e.g. when a new folder is dropped. Loads in flight still settle. */
  clear(): void {
    this.done.clear();
    this.loading.clear();
    this.failures.clear();
  }
}
