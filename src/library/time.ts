// Times are local wall-clock as the car recorded them. We store them as Date.UTC(...) of
// those fields ("wall ms") and format with UTC getters, so no time-zone conversion happens.

const STAMP = /^(\d{4})-(\d{2})-(\d{2})[_T](\d{2})[-:](\d{2})(?:[-:](\d{2}))?$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

export function parseWallStamp(s: string): number | null {
  const m = STAMP.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, sec);
  const back = new Date(ms);
  const valid =
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo - 1 &&
    back.getUTCDate() === d &&
    back.getUTCHours() === h &&
    back.getUTCMinutes() === mi &&
    back.getUTCSeconds() === sec;
  return valid ? ms : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatWall(ms: number, style: 'full' | 'date' | 'clock'): string {
  const d = new Date(ms);
  const date = `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (style === 'date') return date;
  if (style === 'clock') return clock;
  return `${date} ${clock}`;
}

export function dayHeading(ms: number, todayMs: number): string {
  const day = Math.floor(ms / DAY_MS);
  const today = Math.floor(todayMs / DAY_MS);
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return formatWall(ms, 'date');
}

/** The local clock right now, as wall ms. */
export function nowWallMs(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds());
}
