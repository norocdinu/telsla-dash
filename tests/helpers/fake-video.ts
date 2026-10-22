// A stand-in for HTMLVideoElement, enough for PlaybackEngine: loading by object URL, errors,
// play/pause, seeking, ended, requestVideoFrameCallback, and the media load algorithm's reset
// of playbackRate to defaultPlaybackRate.

/** What a file does when loaded: plays for `duration` seconds, or fails with a MediaError code. */
export interface FakeMedia {
  duration?: number;
  error?: number;
}

/** Behaviour per file name. Unknown names play for 60 s. */
export const media = new Map<string, FakeMedia>();

export function installFakeMedia(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.MediaError ??= { MEDIA_ERR_ABORTED: 1, MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 };
  URL.createObjectURL = (b: Blob) => `fake:${(b as File).name}`;
  URL.revokeObjectURL = () => undefined;
}

type FrameCallback = (now: number, meta: { mediaTime: number }) => void;

export class FakeVideo extends EventTarget {
  muted = false;
  playsInline = false;
  preload = '';
  playbackRate = 1;
  defaultPlaybackRate = 1;
  readyState = 0;
  duration = NaN;
  paused = true;
  ended = false;
  error: { code: number } | null = null;
  private time = 0;
  private source = '';
  private frames: FrameCallback[] = [];
  private classes = new Set<string>();

  classList = {
    toggle: (c: string, force?: boolean) => {
      const on = force ?? !this.classes.has(c);
      if (on) this.classes.add(c);
      else this.classes.delete(c);
      return on;
    },
    contains: (c: string) => this.classes.has(c),
  };

  get src(): string {
    return this.source;
  }

  set src(v: string) {
    this.source = v;
    this.startLoad();
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.source = '';
  }

  load(): void {
    this.startLoad();
  }

  get currentTime(): number {
    return this.time;
  }

  set currentTime(v: number) {
    this.time = Number.isFinite(this.duration) ? Math.max(0, Math.min(v, this.duration)) : Math.max(0, v);
    this.ended = false;
    this.present();
  }

  play(): Promise<void> {
    if (!this.error && this.source) this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  requestVideoFrameCallback(cb: FrameCallback): number {
    this.frames.push(cb);
    return this.frames.length;
  }

  /** Name of the file loaded, or '' */
  get fileName(): string {
    return this.source.replace(/^fake:/, '');
  }

  /** Moves playback on by `seconds` of wall time. */
  advance(seconds: number): void {
    if (this.paused || this.readyState < 1) return;
    this.time += seconds * this.playbackRate;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.paused = true;
      this.ended = true;
      this.present();
      this.dispatchEvent(new Event('ended'));
      return;
    }
    this.present();
  }

  private present(): void {
    if (this.readyState < 1) return;
    const cbs = this.frames;
    this.frames = [];
    cbs.forEach((cb) => cb(0, { mediaTime: this.time }));
  }

  /** The HTML media load algorithm, simplified: reset, then metadata or an error a moment later. */
  private startLoad(): void {
    this.playbackRate = this.defaultPlaybackRate;
    this.readyState = 0;
    this.duration = NaN;
    this.error = null;
    this.paused = true;
    this.ended = false;
    this.time = 0;
    const src = this.source;
    if (!src) return;
    setTimeout(() => {
      if (this.source !== src) return;
      const m = media.get(this.fileName) ?? { duration: 60 };
      if (m.error) {
        this.error = { code: m.error };
        this.dispatchEvent(new Event('error'));
        return;
      }
      this.duration = m.duration ?? 60;
      this.readyState = 4;
      this.dispatchEvent(new Event('loadedmetadata'));
      this.present();
    }, 0);
  }
}
