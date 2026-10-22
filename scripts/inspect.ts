// Re-runnable check of real clips (spec "Step 1"): bun run scripts/inspect.ts <dir>
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { attachEvents, buildLibrary } from '../src/library/build-library';
import type { SourceFile } from '../src/library/types';
import { classifyHead, HEAD_BYTES, parseMp4 } from '../src/mp4/read-mp4';
import { extractTelemetry, type TelemetryTrack } from '../src/sei/telemetry';

const root = process.argv[2];
if (!root) {
  console.error('usage: bun run scripts/inspect.ts <dir>');
  process.exit(2);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const paths = walk(root);
const sources: SourceFile[] = paths.map((p) => ({
  path: relative(root, p).split(sep).join('/'),
  name: p.split(sep).pop()!,
  size: statSync(p).size,
  getFile: async () => new File([await Bun.file(p).arrayBuffer()], p.split(sep).pop()!),
}));

const lib = buildLibrary(sources);
await attachEvents(lib, async (f) => (await f.getFile()).text());

console.log(`\n== Library: ${lib.timelines.length} timelines, ${lib.ignored} ignored entries`);
for (const tl of lib.timelines) {
  console.log(`  ${tl.kind.padEnd(6)} ${tl.id}  segments=${tl.segments.length}  cameras=${tl.cameras.join(',')}`);
}

const health: Record<string, number> = {};
for (const p of paths.filter((p) => p.toLowerCase().endsWith('.mp4'))) {
  const size = statSync(p).size;
  const head = new Uint8Array(await Bun.file(p).slice(0, HEAD_BYTES).arrayBuffer());
  const h = classifyHead(head, size);
  health[h] = (health[h] ?? 0) + 1;
}
console.log('\n== File health:', health);

const corr = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
};

const range = { pedal: [Infinity, -Infinity], steering: [Infinity, -Infinity] };
const gears = new Set<number>();
const autopilot = new Set<number>();
const dv: number[] = [], ayMean: number[] = [], dh: number[] = [], steerMid: number[] = [];

console.log('\n== Front files');
for (const tl of lib.timelines) {
  for (const seg of tl.segments) {
    const f = seg.files.front;
    if (!f) continue;
    const full = paths.find((p) => relative(root, p).split(sep).join('/') === f.path)!;
    const buf = new Uint8Array(await Bun.file(full).arrayBuffer());
    let tr: TelemetryTrack;
    let reordered: boolean;
    try {
      reordered = parseMp4(buf).reordered;
      tr = extractTelemetry(buf);
    } catch (e) {
      console.log(`  ${f.path}: ${(e as Error).message}`);
      continue;
    }
    const frames = tr.t.length;
    const sei = tr.has.reduce((a, b) => a + b, 0);
    const fps = frames / (tr.durationS || 1);
    console.log(`  ${f.path.padEnd(64)} codec=${tr.codec} frames=${frames} sei=${sei} fps=${fps.toFixed(1)} reordered=${reordered}`);
    for (let i = 0; i < frames; i++) {
      if (!tr.has[i]) continue;
      range.pedal = [Math.min(range.pedal[0], tr.pedal[i]), Math.max(range.pedal[1], tr.pedal[i])];
      range.steering = [Math.min(range.steering[0], tr.steering[i]), Math.max(range.steering[1], tr.steering[i])];
      gears.add(tr.gear[i]);
      autopilot.add(tr.autopilot[i]);
    }
    const step = Math.max(1, Math.round(fps));
    for (let i = step; i < frames; i += step) {
      let all = true;
      for (let j = i - step; j <= i; j++) if (!tr.has[j]) all = false;
      if (!all || tr.speed[i] < 2) continue;
      dv.push(tr.speed[i] - tr.speed[i - step]);
      let a = 0;
      for (let j = i - step; j < i; j++) a += tr.ay[j];
      ayMean.push(a / step);
      let h = tr.heading[i] - tr.heading[i - step];
      if (h > 180) h -= 360;
      if (h < -180) h += 360;
      dh.push(h);
      steerMid.push(tr.steering[i - (step >> 1)]);
    }
  }
}

console.log('\n== Driving data');
console.log(`  pedal range: ${range.pedal.map((x) => x.toFixed(1)).join(' .. ')}`);
console.log(`  steering range: ${range.steering.map((x) => x.toFixed(1)).join(' .. ')}`);
console.log(`  gears seen: ${[...gears].sort().join(',')}   autopilot seen: ${[...autopilot].sort().join(',')}`);
console.log(`  corr(1 s speed change, mean ay) = ${corr(dv, ayMean).toFixed(2)}   (negative: ay is negative when speeding up)`);
console.log(`  corr(1 s clockwise heading change, steering) = ${corr(dh, steerMid).toFixed(2)}   (positive: positive steering is right)`);

const keys = new Set<string>();
const reasons = new Set<string>();
for (const tl of lib.timelines) {
  if (!tl.eventJson) continue;
  const j = JSON.parse(await (await tl.eventJson.getFile()).text()) as Record<string, unknown>;
  Object.keys(j).forEach((k) => keys.add(k));
  if (typeof j.reason === 'string') reasons.add(j.reason);
}
console.log('\n== event.json');
console.log(`  keys: ${[...keys].join(', ')}`);
console.log(`  reasons: ${[...reasons].sort().join(', ')}`);
