import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { engine, scanNear, toggleStats } from '../../app/playback';
import { appStore, playStore, type PlayState } from '../../app/state';
import { useStore } from '../../app/store';
import type { CameraId, SourceFile, Timeline } from '../../library/types';
import type { Moment } from '../../moments/detect';
import { inspectFile } from '../../mp4/read-mp4';
import { bounds, buildSpans } from '../../player/timeline-math';
import type { SeriesKey } from '../../stats/points';
import { statsRows, type FileDetails } from '../../stats/rows';
import { G } from '../../stats/scale';
import type { ChartMinute } from '../../stats/series';
import { chartWindow, type TimeWindow } from '../../stats/window';
import { speedExact, speedValue, steeringWhole, unitLabel } from '../format';
import { CloseIcon, StatsIcon } from '../icons';
import { StatsChart, type ChartLine } from './StatsChart';
import { effectiveMain } from './VideoStage';

/** While playing, the numbers and the moment-on-screen line update at most this often. */
const THROTTLE_MS = 100;
const EASE_MS = 200;
const GAP_PX = 12;
const NO_CHARTS: (ChartMinute | undefined)[] = [];
const NO_MOMENTS: Moment[] = [];

const SPEED: ChartLine[] = [{ key: 'speed', className: 'is-speed', label: 'Speed' }];
const PEDAL: ChartLine[] = [{ key: 'pedal', className: 'is-pedal', label: 'Accelerator' }];
const BRAKE: ChartLine = { key: 'brake', className: 'is-brake', label: 'Brake' };
const STEERING: ChartLine[] = [{ key: 'steering', className: 'is-steering', label: 'Steering' }];
const G_LINES: ChartLine[] = [
  { key: 'side', className: 'is-side', label: 'Side' },
  { key: 'forward', className: 'is-forward', label: 'Forward' },
];

/** The play state, at most 10 times a second while playing; every change when paused (stepping shows each frame). */
function useThrottledPlay(): PlayState {
  const [snap, setSnap] = useState(() => playStore.get());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const update = () => {
      timer = null;
      last = performance.now();
      setSnap(playStore.get());
    };
    const unsubscribe = playStore.subscribe(() => {
      if (!playStore.get().playing) {
        if (timer) clearTimeout(timer);
        update();
      } else if (!timer) {
        timer = setTimeout(update, Math.max(0, THROTTLE_MS - (performance.now() - last)));
      }
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return snap;
}

/**
 * The charts' time window: the whole clip while playing, 30 s around the moment on screen when paused, easing
 * between the two when play starts or stops. Returns where the ease starts, where it ends and how far it is.
 */
function useChartWindow(clip: { startMs: number; endMs: number }): { from: TimeWindow; to: TimeWindow; t: number } {
  const pausedAt = useStore(playStore, (s) => (s.playing ? null : s.wallMs));
  const to = useMemo(() => chartWindow(clip, pausedAt ?? clip.startMs, pausedAt !== null), [clip, pausedAt]);
  const [ease, setEase] = useState<{ from: TimeWindow; t: number } | null>(null);
  const shown = useRef(to);
  useEffect(() => {
    shown.current = to;
  }, [to]);

  useEffect(() => {
    let raf = 0;
    let wasPlaying = playStore.get().playing;
    const unsubscribe = playStore.subscribe(() => {
      const { playing } = playStore.get();
      if (playing === wasPlaying) return;
      wasPlaying = playing;
      const from = shown.current;
      const start = performance.now();
      cancelAnimationFrame(raf);
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / EASE_MS);
        setEase(t < 1 ? { from, t: 1 - (1 - t) ** 3 } : null);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      step();
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, []);

  // While paused, read the minutes around the moment on screen next, so the zoomed charts fill in first.
  useEffect(() => {
    if (pausedAt !== null) scanNear(pausedAt);
  }, [pausedAt]);

  return ease ? { from: ease.from, to, t: ease.t } : { from: to, to, t: 1 };
}

type Details = Pick<FileDetails, 'frames' | 'durationS' | 'codec'>;
const detailsCache = new Map<string, Promise<Details>>();

/** Frame count, length and codec of a clip file, read from its moov once per file. */
function readDetails(file: SourceFile): Promise<Details> {
  let p = detailsCache.get(file.path);
  if (!p) {
    p = file
      .getFile()
      .then((f) => inspectFile(async (offset, length) => new Uint8Array(await f.slice(offset, offset + length).arrayBuffer()), f.size))
      .then(({ frames, durationS, codec }) => ({ frames, durationS, codec }))
      .catch(() => ({ frames: null, durationS: null, codec: null }));
    detailsCache.set(file.path, p);
  }
  return p;
}

function useFileDetails(file: SourceFile | null): Details | null {
  const [got, setGot] = useState<{ path: string; details: Details } | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    void readDetails(file).then((details) => live && setGot({ path: file.path, details }));
    return () => {
      live = false;
    };
  }, [file]);
  return got && file && got.path === file.path ? got.details : null;
}

/** Keeps the panel between the top cards and the controls, whatever their height. */
function useInsets(panel: RefObject<HTMLElement | null>): { top: number; bottom: number } | null {
  const [insets, setInsets] = useState<{ top: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const stage = panel.current?.parentElement;
    const cards = stage?.querySelector<HTMLElement>('.top-cards');
    const controls = stage?.querySelector<HTMLElement>('.controls');
    if (!stage || !cards || !controls) return;
    const measure = () =>
      setInsets({ top: cards.offsetTop + cards.offsetHeight + GAP_PX, bottom: stage.clientHeight - controls.offsetTop + GAP_PX });
    const ro = new ResizeObserver(measure);
    for (const el of [stage, cards, controls]) ro.observe(el);
    return () => ro.disconnect();
  }, [panel]);
  return insets;
}

/** The player's button for Stats for nerds, beside the map button. */
export function StatsToggle() {
  const open = useStore(appStore, (s) => s.settings.showStats);
  return (
    <button
      type="button"
      className={`icon-btn${open ? ' is-on' : ''}`}
      aria-pressed={open}
      aria-label="Stats for nerds"
      title="Stats for nerds (S)"
      onClick={toggleStats}
    >
      <StatsIcon />
    </button>
  );
}

/** Stats for nerds: every recorded value for the frame on screen, and charts of the whole clip (30 s when paused). */
export function StatsPanel({ tl }: { tl: Timeline }) {
  const panel = useRef<HTMLElement>(null);
  const insets = useInsets(panel);
  const units = useStore(appStore, (s) => s.settings.units);
  const view = useStore(appStore, (s) => s.view);
  const durations = useStore(appStore, (s) => s.durations);
  const minutes = useStore(appStore, (s) => s.charts[tl.id] ?? NO_CHARTS);
  const moments = useStore(appStore, (s) => s.moments[tl.id] ?? NO_MOMENTS);
  const play = useThrottledPlay();
  const spans = useMemo(() => buildSpans(tl.segments, durations), [tl, durations]);
  const clip = useMemo(() => bounds(spans), [spans]);
  const { from, to, t } = useChartWindow(clip);

  // The camera shown largest: the main one, or the front in the grid.
  const main: CameraId = effectiveMain(tl, view.grid ? 'front' : view.main);
  const file = tl.segments[play.index]?.files[main] ?? null;
  const details = useFileDetails(file);
  const size = engine.videoSize(main);
  const groups = statsRows(
    play.frameStatus === 'data' ? play.frame : null,
    {
      minute: Math.min(play.index + 1, tl.segments.length),
      minutes: tl.segments.length,
      clipS: Math.max(0, ((play.wallMs || clip.startMs) - clip.startMs) / 1000),
      file: file && {
        name: file.name,
        frames: details?.frames ?? null,
        durationS: details?.durationS ?? null,
        codec: details?.codec ?? null,
        width: size?.width ?? null,
        height: size?.height ?? null,
      },
    },
    units,
  );

  const f = play.frameStatus === 'data' ? play.frame : null;
  const dash = '—';
  const format = (key: SeriesKey, v: number): string => {
    if (key === 'speed') return `${speedExact(v, units).toFixed(1)} ${unitLabel(units)}`;
    if (key === 'pedal') return `${v.toFixed(0)} %`;
    if (key === 'brake') return v >= 1 ? 'on' : 'off';
    if (key === 'steering') return `${v.toFixed(1)}°`;
    return `${(v / G).toFixed(2)} g`;
  };
  const common = { minutes, spans, from, to, t, units, nowMs: play.wallMs, moments, format };

  return (
    <section
      ref={panel}
      className="stats-panel"
      aria-label="Stats for nerds"
      style={insets ? { top: insets.top, bottom: insets.bottom } : { visibility: 'hidden' }}
    >
      <header className="stats-head">
        <h2>Stats for nerds</h2>
        <button type="button" className="sheet-icon-btn" onClick={toggleStats} aria-label="Close Stats for nerds" title="Close (S)">
          <CloseIcon />
        </button>
      </header>
      <div className="stats-numbers">
        <div className="stats-numbers-flow">
          {groups.map((g) => (
            <div className="stats-group" key={g.title}>
              <h3>{g.title}</h3>
              {g.rows.map(([label, value]) => (
                <div className="stats-row" key={label}>
                  <span className="stats-label">{label}</span>
                  <span className="stats-value tabular">{value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="stats-charts">
        <StatsChart {...common} title="Speed" kind="speed" lines={SPEED} value={f ? `${speedValue(f.speedMps, units)} ${unitLabel(units)}` : dash} />
        <StatsChart
          {...common}
          title="Pedals"
          kind="pedals"
          lines={PEDAL}
          band={BRAKE}
          value={f ? `${Math.round(f.pedal)} % · brake ${f.brake ? 'on' : 'off'}` : dash}
        />
        <StatsChart {...common} title="Steering" kind="steering" lines={STEERING} value={f ? `${steeringWhole(f.steeringDeg)}°` : dash} />
        <StatsChart
          {...common}
          title="G-force"
          kind="g"
          lines={G_LINES}
          value={f ? `side ${(f.ax / G).toFixed(2)} · fwd ${(-f.ay / G).toFixed(2)}` : dash}
        />
      </div>
    </section>
  );
}
