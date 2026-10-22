import type { CameraId, SourceFile, Timeline } from '../library/types';
import { inspectFile } from '../mp4/read-mp4';
import { ObjectUrls } from './object-urls';
import { buildSpans, locate, wallAt, type Span } from './timeline-math';

export type SlotStatus = 'ok' | 'missing' | 'codec' | 'damaged' | 'encrypted';

export interface EngineCallbacks {
  onFrame(p: { index: number; offsetS: number; wallMs: number }): void;
  onState(s: { playing: boolean; rate: number; waiting: boolean }): void;
  onDuration(segmentKey: string, seconds: number): void;
  onSlot(camera: CameraId, status: SlotStatus): void;
}

export const RATES = [0.5, 1, 2, 4];
export const PRELOAD_LEAD_S = 5;
export const SYNC_INTERVAL_MS = 500;
export const SYNC_TOLERANCE_S = 0.1;
export const FALLBACK_FRAME_S = 1 / 36;

interface Slot {
  camera: CameraId;
  els: [HTMLVideoElement, HTMLVideoElement];
  active: 0 | 1;
  /** Segment index each element holds (-1 for none). */
  holds: [number, number];
  /** File path each element holds, for releasing its URL. */
  paths: [string | null, string | null];
  /** Why each element's file failed to load, once known (also for the preloaded element). */
  fail: [SlotStatus | null, SlotStatus | null];
  /** Status of the active element, as last reported. */
  status: SlotStatus;
}

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Drives the <video> elements of one timeline. Each camera slot has two elements: the active one plays,
 * the other preloads the next segment so segment changes don't flash. The clock camera's element is the master.
 */
export class PlaybackEngine {
  private readonly cb: EngineCallbacks;
  private readonly slots = new Map<CameraId, Slot>();
  private readonly urls = new ObjectUrls();
  private tl: Timeline | null = null;
  private spans: Span[] = [];
  private durations: Record<string, number> = {};
  private index = 0;
  private offsetS = 0;
  private visible: CameraId[] = [];
  private master: CameraId = 'front';
  private playing = false;
  private waiting = false;
  private rate = 1;
  private frameToken = 0;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(cb: EngineCallbacks) {
    this.cb = cb;
  }

  attachSlot(camera: CameraId, a: HTMLVideoElement, b: HTMLVideoElement): () => void {
    const slot: Slot = { camera, els: [a, b], active: 0, holds: [-1, -1], paths: [null, null], fail: [null, null], status: 'ok' };
    const cleanups: (() => void)[] = [];
    for (const i of [0, 1] as const) {
      const el = slot.els[i];
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      this.applyRate(el);
      const on = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: () => void) => {
        el.addEventListener(type, fn);
        cleanups.push(() => el.removeEventListener(type, fn));
      };
      on('ended', () => this.onEnded(slot, i));
      on('error', () => void this.onError(slot, i));
      on('loadedmetadata', () => this.onMetadata(slot, i));
      on('waiting', () => this.setWaiting(slot, i, true));
      on('playing', () => this.setWaiting(slot, i, false));
    }
    this.slots.set(camera, slot);
    this.markActive(slot);
    if (this.tl && this.visible.includes(camera)) void this.showSegment(slot, this.index, this.offsetS);
    return () => {
      cleanups.forEach((c) => c());
      for (const i of [0, 1] as const) this.unload(slot, i);
      this.slots.delete(camera);
    };
  }

  load(tl: Timeline, durations: Record<string, number>, startWallMs?: number): void {
    this.pause();
    for (const slot of this.slots.values()) {
      for (const i of [0, 1] as const) this.unload(slot, i);
      // A new timeline starts clean, so every camera's state is reported afresh.
      slot.status = 'ok';
    }
    this.tl = tl;
    this.durations = { ...durations };
    this.spans = buildSpans(tl.segments, this.durations);
    const pos = locate(this.spans, startWallMs ?? tl.startMs);
    this.goTo(pos.index, pos.offsetS);
    this.startSync();
  }

  /** Real segment lengths learned elsewhere (e.g. read up front); the position is kept. */
  setDurations(durations: Record<string, number>): void {
    if (!this.tl) return;
    this.durations = { ...this.durations, ...durations };
    this.spans = buildSpans(this.tl.segments, this.durations);
  }

  setVisible(cameras: CameraId[], master: CameraId): void {
    this.visible = cameras;
    this.master = master;
    for (const slot of this.slots.values()) {
      if (cameras.includes(slot.camera)) void this.showSegment(slot, this.index, this.offsetS);
      else slot.els.forEach((el) => el.pause());
    }
    this.watchFrames();
  }

  play(): void {
    if (!this.tl) return;
    this.playing = true;
    for (const slot of this.visibleSlots()) void this.activeEl(slot).play().catch(() => undefined);
    this.emitState();
    this.keepMoving();
  }

  pause(): void {
    this.playing = false;
    for (const slot of this.slots.values()) slot.els.forEach((el) => el.pause());
    this.emitState();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(wallMs: number): void {
    if (!this.tl) return;
    const pos = locate(this.spans, wallMs);
    this.goTo(pos.index, pos.offsetS);
  }

  skip(deltaS: number): void {
    this.seek(this.currentWall() + deltaS * 1000);
  }

  /** One frame forward or back, paused. */
  step(dir: 1 | -1, frameS = FALLBACK_FRAME_S): void {
    this.pause();
    // A millisecond past the target frame's start keeps rounding from landing on the previous frame.
    this.seek(this.currentWall() + dir * frameS * 1000 + 1);
  }

  cycleRate(): void {
    this.rate = RATES[(RATES.indexOf(this.rate) + 1) % RATES.length];
    for (const slot of this.slots.values()) slot.els.forEach((el) => this.applyRate(el));
    this.emitState();
  }

  /**
   * Lets go of every file (e.g. before deleting them: Windows won't delete a file that is still open).
   * Slots stay attached, so a later load() plays as usual.
   */
  release(): void {
    this.pause();
    this.frameToken++;
    for (const slot of this.slots.values()) {
      for (const i of [0, 1] as const) this.unload(slot, i);
      slot.status = 'ok';
    }
    this.urls.releaseAll();
    this.tl = null;
  }

  destroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.frameToken++;
    for (const slot of this.slots.values()) for (const i of [0, 1] as const) this.unload(slot, i);
    this.urls.releaseAll();
    this.slots.clear();
    this.tl = null;
  }

  // --- internals ---

  private currentWall(): number {
    return wallAt(this.spans, this.index, this.offsetS);
  }

  private visibleSlots(): Slot[] {
    return this.visible.map((c) => this.slots.get(c)).filter((s): s is Slot => !!s);
  }

  private activeEl(slot: Slot): HTMLVideoElement {
    return slot.els[slot.active];
  }

  /** The camera whose element drives time: the main view, else the first visible camera that plays. */
  private clockSlot(): Slot | null {
    const main = this.slots.get(this.master);
    if (main && this.visible.includes(this.master) && main.status === 'ok') return main;
    return this.visibleSlots().find((s) => s.status === 'ok') ?? null;
  }

  /** Loading a file resets playbackRate to defaultPlaybackRate, so set both. */
  private applyRate(el: HTMLVideoElement): void {
    el.defaultPlaybackRate = this.rate;
    el.playbackRate = this.rate;
  }

  /** While playing with no camera in view able to play this segment, move on to the next one. */
  private keepMoving(): void {
    if (!this.playing || !this.tl || this.clockSlot()) return;
    queueMicrotask(() => {
      if (this.playing && this.tl && !this.clockSlot()) this.advance();
    });
  }

  private markActive(slot: Slot): void {
    slot.els.forEach((el, i) => el.classList.toggle('is-active', i === slot.active));
  }

  private setStatus(slot: Slot, status: SlotStatus): void {
    if (slot.status === status) return;
    slot.status = status;
    this.cb.onSlot(slot.camera, status);
    if (slot.camera === this.master || status === 'ok') this.watchFrames();
  }

  private fileFor(camera: CameraId, index: number): SourceFile | null {
    return this.tl?.segments[index]?.files[camera] ?? null;
  }

  private unload(slot: Slot, i: 0 | 1): void {
    const el = slot.els[i];
    el.pause();
    el.removeAttribute('src');
    el.load();
    if (slot.paths[i]) this.urls.release(slot.paths[i]!);
    slot.paths[i] = null;
    slot.holds[i] = -1;
    slot.fail[i] = null;
  }

  private async loadInto(slot: Slot, i: 0 | 1, index: number): Promise<boolean> {
    if (slot.holds[i] === index) return true;
    const file = this.fileFor(slot.camera, index);
    this.unload(slot, i);
    if (!file) return false;
    slot.holds[i] = index;
    slot.paths[i] = file.path;
    const url = await this.urls.retain(file);
    if (slot.holds[i] !== index || slot.paths[i] !== file.path) return false;
    const el = slot.els[i];
    this.applyRate(el);
    el.src = url;
    el.load();
    return true;
  }

  private goTo(index: number, offsetS: number): void {
    this.index = index;
    this.offsetS = offsetS;
    for (const slot of this.visibleSlots()) void this.showSegment(slot, index, offsetS);
    this.watchFrames();
    this.emitFrame();
  }

  /** Makes the slot's active element show `index` at `offsetS`, flipping to the preloaded element if it has it. */
  private async showSegment(slot: Slot, index: number, offsetS: number): Promise<void> {
    if (!this.tl) return;
    if (!this.fileFor(slot.camera, index)) {
      this.unload(slot, slot.active);
      this.setStatus(slot, 'missing');
      this.keepMoving();
      return;
    }
    const other = (1 - slot.active) as 0 | 1;
    if (slot.holds[slot.active] !== index && slot.holds[other] === index) {
      this.activeEl(slot).pause();
      slot.active = other;
      this.markActive(slot);
      if (slot.camera === this.clockSlot()?.camera) this.watchFrames();
    }
    if (slot.holds[slot.active] !== index) {
      this.setStatus(slot, 'ok');
      const ok = await this.loadInto(slot, slot.active, index);
      if (!ok || this.index !== index) return;
      if (slot === this.clockSlot()) this.watchFrames();
    }
    const failed = slot.fail[slot.active];
    if (failed) {
      // This file is already known to be bad (often found while it was being preloaded).
      this.setStatus(slot, failed);
      this.keepMoving();
      return;
    }
    this.setStatus(slot, 'ok');
    const el = this.activeEl(slot);
    const apply = () => {
      if (this.index !== index) return;
      el.currentTime = Math.min(offsetS, Number.isFinite(el.duration) ? el.duration : offsetS);
      if (this.playing) void el.play().catch(() => undefined);
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
  }

  private preloadNext(): void {
    const next = this.index + 1;
    if (!this.tl || next >= this.tl.segments.length) return;
    for (const slot of this.visibleSlots()) {
      const other = (1 - slot.active) as 0 | 1;
      if (slot.holds[other] !== next) void this.loadInto(slot, other, next);
    }
  }

  private onMetadata(slot: Slot, i: 0 | 1): void {
    const index = slot.holds[i];
    const seg = this.tl?.segments[index];
    const el = slot.els[i];
    if (!seg || !Number.isFinite(el.duration)) return;
    // The clock camera's file defines the segment's length.
    if (slot.camera === (this.clockSlot()?.camera ?? 'front') && this.durations[seg.key] !== el.duration) {
      this.durations[seg.key] = el.duration;
      this.spans = buildSpans(this.tl!.segments, this.durations);
      this.cb.onDuration(seg.key, el.duration);
    }
  }

  private onEnded(slot: Slot, i: 0 | 1): void {
    if (i !== slot.active || slot !== this.clockSlot()) return;
    this.advance();
  }

  private advance(): void {
    if (!this.tl) return;
    if (this.index + 1 < this.tl.segments.length) {
      this.goTo(this.index + 1, 0);
    } else {
      this.offsetS = this.spans[this.index]?.durationS ?? this.offsetS;
      this.pause();
      this.emitFrame();
    }
  }

  private async onError(slot: Slot, i: 0 | 1): Promise<void> {
    const index = slot.holds[i];
    const file = index >= 0 ? this.fileFor(slot.camera, index) : null;
    if (!file) return;
    const el = slot.els[i];
    let status: SlotStatus;
    try {
      const f = await file.getFile();
      const read = async (offset: number, length: number) => new Uint8Array(await f.slice(offset, offset + length).arrayBuffer());
      const info = await inspectFile(read, f.size);
      // An MP4 that is whole and H.264 should play, so a failure means the file is bad, not the browser.
      if (info.health !== 'mp4') status = info.health;
      else if (!info.complete || info.codec === 'avc1' || info.codec === 'avc3') status = 'damaged';
      else status = el.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'codec' : 'damaged';
    } catch {
      status = 'damaged';
    }
    if (slot.holds[i] !== index) return;
    slot.fail[i] = status;
    // A preloaded element's failure is shown when the segment is reached (showSegment).
    if (i !== slot.active || index !== this.index) return;
    this.setStatus(slot, status);
    this.keepMoving();
  }

  private setWaiting(slot: Slot, i: 0 | 1, waiting: boolean): void {
    if (slot !== this.clockSlot() || i !== slot.active || this.waiting === waiting) return;
    this.waiting = waiting;
    this.emitState();
  }

  /** Follows the clock element frame by frame (requestVideoFrameCallback, else timeupdate). */
  private watchFrames(): void {
    const token = ++this.frameToken;
    const slot = this.clockSlot();
    if (!slot) return;
    const el = this.activeEl(slot) as VideoWithFrames;
    const index = slot.holds[slot.active];
    const tick = (mediaTime: number) => {
      if (token !== this.frameToken || index !== this.index) return;
      this.offsetS = mediaTime;
      this.emitFrame();
      const span = this.spans[this.index];
      if (span && mediaTime > span.durationS - PRELOAD_LEAD_S) this.preloadNext();
    };
    if (el.requestVideoFrameCallback) {
      const loop = (_now: number, meta: { mediaTime: number }) => {
        if (token !== this.frameToken) return;
        tick(meta.mediaTime);
        el.requestVideoFrameCallback!(loop);
      };
      el.requestVideoFrameCallback(loop);
    } else {
      const onTime = () => {
        if (token !== this.frameToken) return el.removeEventListener('timeupdate', onTime);
        tick(el.currentTime);
      };
      el.addEventListener('timeupdate', onTime);
    }
  }

  private startSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      const clock = this.clockSlot();
      if (!clock) return;
      const m = this.activeEl(clock);
      for (const slot of this.visibleSlots()) {
        if (slot === clock || slot.status !== 'ok' || slot.holds[slot.active] !== this.index) continue;
        const el = this.activeEl(slot);
        if (el.readyState < 1) continue;
        if (Math.abs(el.currentTime - m.currentTime) > SYNC_TOLERANCE_S && m.currentTime <= el.duration) {
          el.currentTime = m.currentTime;
        }
        if (this.playing && el.paused && !el.ended) void el.play().catch(() => undefined);
      }
    }, SYNC_INTERVAL_MS);
  }

  private emitFrame(): void {
    this.cb.onFrame({ index: this.index, offsetS: this.offsetS, wallMs: this.currentWall() });
  }

  private emitState(): void {
    this.cb.onState({ playing: this.playing, rate: this.rate, waiting: this.waiting });
  }
}
