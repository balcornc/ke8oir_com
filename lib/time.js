// Time helpers. Everything on this site is America/New_York wall-clock time.
//
// Authors write event times as local New York wall-clock strings
// ("2026-11-14 10:00"). This module converts them to real UTC instants, so
// daylight saving time (EST <-> EDT) is handled by the platform's tz database
// and never by hand-rolled offsets.

export const TZ = "America/New_York";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Offset of New York from UTC (ms, negative) at a given UTC instant. */
export function nyOffsetMs(utcMs) {
  const p = {};
  for (const part of partsFmt.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

const HOUR = 3600 * 1000;

/**
 * Convert a New York wall-clock time to a UTC instant (ms).
 *  - A time that does not exist (spring-forward gap, e.g. 2:30 AM on the
 *    second Sunday of March) throws, so a typo can't silently shift an event.
 *  - An ambiguous time (fall-back hour, e.g. 1:30 AM on the first Sunday of
 *    November) resolves to the FIRST occurrence (daylight time).
 */
export function nyWallToUtcMs(y, mo, d, h = 0, mi = 0) {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const candidates = [];
  for (const offset of [-4 * HOUR, -5 * HOUR]) {
    const utc = naive - offset;
    if (nyOffsetMs(utc) === offset) candidates.push(utc);
  }
  if (candidates.length === 0) {
    throw new Error(
      `${pad(y, 4)}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)} does not exist in ${TZ} ` +
        `(it falls in the daylight-saving "spring forward" gap). Pick a different time.`,
    );
  }
  return Math.min(...candidates);
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/;

/** Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" (also with a "T"). */
export function parseLocal(value, label = "date") {
  const str = String(value ?? "").trim();
  const m = LOCAL_RE.exec(str);
  if (!m) {
    throw new Error(
      `Invalid ${label} "${str}". Use "YYYY-MM-DD" (all-day) or "YYYY-MM-DD HH:mm" in 24-hour New York time.`,
    );
  }
  const [, y, mo, d, h, mi] = m;
  const out = {
    y: +y,
    mo: +mo,
    d: +d,
    h: h === undefined ? 0 : +h,
    mi: mi === undefined ? 0 : +mi,
    hasTime: h !== undefined,
  };
  // Reject impossible calendar dates like 2026-02-31 or 25:00.
  const check = new Date(Date.UTC(out.y, out.mo - 1, out.d, out.h, out.mi));
  if (
    check.getUTCFullYear() !== out.y ||
    check.getUTCMonth() !== out.mo - 1 ||
    check.getUTCDate() !== out.d ||
    out.h > 23 ||
    out.mi > 59
  ) {
    throw new Error(`Invalid ${label} "${str}": that is not a real calendar date/time.`);
  }
  return out;
}

/** "YYYY-MM-DD" plus n days, calendar math only (no timezone involved). */
export function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const ymdOf = (p) => `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}`;

const dateLongFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateNoYearFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const timeNoZoneFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});
const monthShortFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" });
const yearFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" });

export const fmtDateLong = (ms) => dateLongFmt.format(new Date(ms));
export const fmtDateNoYear = (ms) => dateNoYearFmt.format(new Date(ms));
export const fmtMonthShort = (ms) => monthShortFmt.format(new Date(ms));
export const fmtDay = (ms) => dayFmt.format(new Date(ms));
export const fmtYear = (ms) => yearFmt.format(new Date(ms));

function tzAbbr(ms) {
  return timeFmt.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "ET";
}

/**
 * "10:00 AM – 12:00 PM EST". The zone is shown once when start and end share
 * it, and on both ends when an event straddles a DST change.
 */
export function fmtTimeRange(startMs, endMs) {
  const start = timeFmt.format(new Date(startMs));
  if (endMs == null) return start;
  const sameZone = tzAbbr(startMs) === tzAbbr(endMs);
  const end = timeFmt.format(new Date(endMs));
  return sameZone
    ? `${timeNoZoneFmt.format(new Date(startMs))} – ${end}`
    : `${start} – ${end}`;
}

/** "2026-11-14" in New York for a UTC instant. */
export function nyYmd(ms) {
  const p = {};
  for (const part of partsFmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Compact UTC stamp for iCalendar: 20261114T150000Z */
export function icsUtc(ms) {
  const d = new Date(ms);
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
