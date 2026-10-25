// Loads and normalizes data/events.yaml (and the "when" of special event pages).
//
// Times in the data files are New York wall-clock strings. Everything that
// leaves this module is a real instant (ISO UTC) plus ready-to-print labels.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  addDaysYmd,
  fmtDateLong,
  fmtDateNoYear,
  fmtDay,
  fmtMonthShort,
  fmtTimeRange,
  nyWallToUtcMs,
  nyYmd,
  parseLocal,
  ymdOf,
} from "./time.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");
export const SPECIAL_DIR = path.join(ROOT, "src", "special-events");

export const EVENT_TYPES = {
  net: "Net",
  meeting: "Meeting",
  exam: "Exam session",
  "field-day": "Field Day",
  "special-event": "Special event",
  other: "Other",
};

/**
 * JSON_SCHEMA keeps unquoted dates like 2026-11-14 as plain strings. The
 * default YAML schema would turn them into UTC Date objects, which would
 * silently shift times. Use this loader for every data file.
 */
export function parseYaml(text, label = "YAML") {
  try {
    return yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    throw new Error(`Could not parse ${label}: ${err.message}`);
  }
}

export function readData(name) {
  const file = path.join(DATA_DIR, name);
  return parseYaml(fs.readFileSync(file, "utf8"), `data/${name}`);
}

export function getSite() {
  return readData("site.yaml");
}

/** Canonical host info, derived from the single `canonicalHost` setting. */
export function getHost(site = getSite()) {
  const canonical = String(site.canonicalHost || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(canonical)) {
    throw new Error(`data/site.yaml: canonicalHost "${site.canonicalHost}" is not a valid host name.`);
  }
  const isWww = canonical.startsWith("www.");
  const apex = isWww ? canonical.slice(4) : canonical;
  return {
    canonical,
    apex,
    isWww,
    other: isWww ? apex : `www.${apex}`,
    url: `https://${canonical}`,
  };
}

export function listSpecialSlugs() {
  if (!fs.existsSync(SPECIAL_DIR)) return [];
  return fs
    .readdirSync(SPECIAL_DIR)
    .filter((f) => /\.(md|njk|html)$/.test(f))
    .map((f) => f.replace(/\.[^.]+$/, ""));
}

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const truthy = (v) => v === true || v === "true" || v === "yes";

/**
 * Normalize start/end/all-day into instants.
 *  - All-day: `end` (optional) is the LAST day, inclusive.
 *  - Timed with no `end`: treated as lasting `defaultHours` for the purpose of
 *    deciding when it stops being "upcoming". No end time is published.
 */
export function normalizeWhen(raw, { defaultHours = 2, label = "event" } = {}) {
  const start = parseLocal(raw.start, `${label} "start"`);
  const allDay = truthy(raw.all_day) || !start.hasTime;
  let startMs;
  let endMs = null;
  let effectiveEndMs;
  let startYmd = ymdOf(start);
  let endYmd = startYmd;

  if (allDay) {
    startMs = nyWallToUtcMs(start.y, start.mo, start.d, 0, 0);
    if (raw.end) {
      const end = parseLocal(raw.end, `${label} "end"`);
      endYmd = ymdOf(end);
      if (endYmd < startYmd) throw new Error(`${label}: "end" (${endYmd}) is before "start" (${startYmd}).`);
    }
    const dayAfter = addDaysYmd(endYmd, 1);
    const [ey, em, ed] = dayAfter.split("-").map(Number);
    effectiveEndMs = nyWallToUtcMs(ey, em, ed, 0, 0); // midnight starting the day after the last day
    endMs = effectiveEndMs; // exclusive end, as iCalendar expects for all-day
  } else {
    startMs = nyWallToUtcMs(start.y, start.mo, start.d, start.h, start.mi);
    if (raw.end) {
      const end = parseLocal(raw.end, `${label} "end"`);
      if (!end.hasTime) {
        throw new Error(`${label}: "end" needs a time (HH:mm) when "start" has one.`);
      }
      endMs = nyWallToUtcMs(end.y, end.mo, end.d, end.h, end.mi);
      if (endMs <= startMs) throw new Error(`${label}: "end" must be after "start".`);
      effectiveEndMs = endMs;
      endYmd = nyYmd(endMs);
    } else {
      effectiveEndMs = startMs + defaultHours * 3600 * 1000;
    }
  }

  const multiDay = endYmd !== startYmd;
  let dateLabel;
  let timeLabel;
  if (allDay) {
    const lastDayMs = nyWallToUtcMs(...endYmd.split("-").map(Number), 12, 0);
    dateLabel = multiDay
      ? `${fmtDateNoYear(startMs + 12 * 3600e3)} – ${fmtDateLong(lastDayMs)}`
      : fmtDateLong(startMs + 12 * 3600e3);
    timeLabel = "All day";
  } else if (multiDay) {
    dateLabel = `${fmtDateNoYear(startMs)} – ${fmtDateLong(endMs)}`;
    timeLabel = `${fmtTimeRange(startMs, null)} → ${fmtTimeRange(endMs, null)}`;
  } else {
    dateLabel = fmtDateLong(startMs);
    timeLabel = fmtTimeRange(startMs, endMs);
  }

  return {
    allDay,
    startMs,
    endMs,
    effectiveEndMs,
    startIso: new Date(startMs).toISOString(),
    endIso: endMs == null ? null : new Date(endMs).toISOString(),
    effectiveEndIso: new Date(effectiveEndMs).toISOString(),
    startYmd,
    endYmd,
    multiDay,
    dateLabel,
    timeLabel,
    monthShort: fmtMonthShort(allDay ? startMs + 12 * 3600e3 : startMs),
    day: fmtDay(allDay ? startMs + 12 * 3600e3 : startMs),
  };
}

const osmSearch = (q) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;

export function normalizeEvents(rawList, { specialSlugs = [], defaultHours = 2, warn = console.warn } = {}) {
  if (!Array.isArray(rawList)) {
    throw new Error("data/events.yaml must be a list (each event starts with a dash).");
  }
  const seen = new Map();
  const out = rawList.map((raw, i) => {
    const where = `data/events.yaml entry #${i + 1}${raw?.title ? ` ("${raw.title}")` : ""}`;
    if (!raw || typeof raw !== "object") throw new Error(`${where}: not a mapping.`);
    if (!raw.title) throw new Error(`${where}: missing "title".`);
    if (!raw.start) throw new Error(`${where}: missing "start".`);
    const type = raw.type ?? "other";
    if (!(type in EVENT_TYPES)) {
      throw new Error(`${where}: unknown type "${type}". Use one of: ${Object.keys(EVENT_TYPES).join(", ")}.`);
    }
    const when = normalizeWhen(raw, { defaultHours, label: where });

    let id = `${when.startYmd}-${slugify(raw.title) || "event"}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    if (n > 1) id = `${id}-${n}`;

    if (raw.slug) {
      if (!/^[a-z0-9-]+$/.test(raw.slug)) {
        throw new Error(`${where}: slug "${raw.slug}" may only contain lowercase letters, digits and dashes.`);
      }
      if (!specialSlugs.includes(raw.slug)) {
        warn(`[events] ${where}: slug "${raw.slug}" has no page at src/special-events/${raw.slug}.md`);
      }
    }

    const address = raw.address ? String(raw.address).trim() : "";
    const mapUrl = raw.map_url || (address && !address.startsWith("[TODO") ? osmSearch(address) : "");

    return {
      id,
      title: String(raw.title),
      type,
      typeLabel: EVENT_TYPES[type],
      ...when,
      location: raw.location ? String(raw.location) : "",
      address,
      mapUrl,
      description: raw.description ? String(raw.description).trim() : "",
      link: raw.link ? String(raw.link) : "",
      slug: raw.slug ? String(raw.slug) : "",
      specialUrl: raw.slug ? `/special-events/${raw.slug}/` : "",
      icsUrl: `/events/${id}.ics`,
      sample: truthy(raw.sample),
      updated: raw.updated ? String(raw.updated) : "",
    };
  });

  out.sort((a, b) => a.startMs - b.startMs || a.title.localeCompare(b.title));
  return out;
}

/** Split into upcoming (ascending) and past (most recent first) at `nowMs`. */
export function splitEvents(events, nowMs) {
  const upcoming = events.filter((e) => e.effectiveEndMs > nowMs);
  const past = events.filter((e) => e.effectiveEndMs <= nowMs).sort((a, b) => b.startMs - a.startMs);
  return { upcoming, past };
}
