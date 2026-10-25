import { test } from "node:test";
import assert from "node:assert/strict";
import { nyWallToUtcMs, parseLocal, fmtTimeRange, addDaysYmd, icsUtc } from "../lib/time.js";
import { normalizeWhen, normalizeEvents, splitEvents } from "../lib/events.js";
import { foldLine, escapeText, buildCalendar } from "../lib/ics.js";

const iso = (ms) => new Date(ms).toISOString();

test("EST (winter) is UTC-5", () => {
  assert.equal(iso(nyWallToUtcMs(2026, 11, 14, 10, 0)), "2026-11-14T15:00:00.000Z");
});

test("EDT (summer) is UTC-4", () => {
  assert.equal(iso(nyWallToUtcMs(2027, 6, 26, 14, 0)), "2027-06-26T18:00:00.000Z");
});

test("spring-forward gap: 2026-03-08 02:30 does not exist and throws", () => {
  assert.throws(() => nyWallToUtcMs(2026, 3, 8, 2, 30), /does not exist/);
});

test("times either side of spring-forward convert correctly", () => {
  assert.equal(iso(nyWallToUtcMs(2026, 3, 8, 1, 59)), "2026-03-08T06:59:00.000Z"); // EST
  assert.equal(iso(nyWallToUtcMs(2026, 3, 8, 3, 0)), "2026-03-08T07:00:00.000Z"); // EDT
});

test("fall-back ambiguity resolves to the first (EDT) occurrence", () => {
  assert.equal(iso(nyWallToUtcMs(2026, 11, 1, 1, 30)), "2026-11-01T05:30:00.000Z");
  assert.equal(iso(nyWallToUtcMs(2026, 11, 1, 2, 0)), "2026-11-01T07:00:00.000Z"); // EST
});

test("parseLocal rejects impossible dates and bad formats", () => {
  assert.throws(() => parseLocal("2026-02-31"), /not a real calendar date/);
  assert.throws(() => parseLocal("2026-11-14 25:00"), /not a real calendar date/);
  assert.throws(() => parseLocal("11/14/2026"), /Invalid/);
  assert.equal(parseLocal("2026-11-14T09:05").hasTime, true);
  assert.equal(parseLocal("2026-11-14").hasTime, false);
});

test("addDaysYmd crosses month and year boundaries", () => {
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysYmd("2028-02-28", 1), "2028-02-29");
});

test("time range labels show EST/EDT and straddling a DST change shows both", () => {
  const a = nyWallToUtcMs(2026, 11, 14, 10, 0);
  const b = nyWallToUtcMs(2026, 11, 14, 12, 0);
  assert.equal(fmtTimeRange(a, b), "10:00 AM – 12:00 PM EST");
  const c = nyWallToUtcMs(2026, 3, 8, 1, 0); // EST
  const d = nyWallToUtcMs(2026, 3, 8, 4, 0); // EDT
  assert.match(fmtTimeRange(c, d), /EST.*EDT/);
});

test("all-day event stays upcoming through the end of its last day (NY time)", () => {
  const w = normalizeWhen({ start: "2026-12-05", end: "2026-12-06" });
  assert.equal(w.allDay, true);
  // 2026-12-06 11:59 PM New York is still upcoming; 2026-12-07 00:00 is not.
  assert.ok(nyWallToUtcMs(2026, 12, 6, 23, 59) < w.effectiveEndMs);
  assert.equal(w.effectiveEndMs, nyWallToUtcMs(2026, 12, 7, 0, 0));
});

test("timed event without end uses the default duration for 'upcoming' only", () => {
  const w = normalizeWhen({ start: "2026-11-14 10:00" }, { defaultHours: 2 });
  assert.equal(w.endMs, null);
  assert.equal(w.effectiveEndMs - w.startMs, 2 * 3600 * 1000);
});

test("events are sorted, split at now, and past is newest-first", () => {
  const evs = normalizeEvents(
    [
      { title: "B", start: "2026-11-20 19:00" },
      { title: "A", start: "2026-11-10 19:00" },
      { title: "Old1", start: "2026-09-01 19:00" },
      { title: "Old2", start: "2026-10-01 19:00" },
    ],
    { warn: () => {} },
  );
  const now = nyWallToUtcMs(2026, 11, 1, 0, 0);
  const { upcoming, past } = splitEvents(evs, now);
  assert.deepEqual(upcoming.map((e) => e.title), ["A", "B"]);
  assert.deepEqual(past.map((e) => e.title), ["Old2", "Old1"]);
});

test("unknown event type and missing title give helpful errors", () => {
  assert.throws(() => normalizeEvents([{ title: "x", start: "2026-11-01", type: "party" }]), /unknown type/);
  assert.throws(() => normalizeEvents([{ start: "2026-11-01" }]), /missing "title"/);
});

test("ICS: escaping, folding, CRLF, all-day exclusive end", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = "X".repeat(200);
  for (const seg of foldLine(long).split("\r\n")) assert.ok(new TextEncoder().encode(seg).length <= 75);
  // Folding must not split a multi-byte character.
  const folded = foldLine("é".repeat(80)).split("\r\n").map((s, i) => (i ? s.slice(1) : s)).join("");
  assert.equal(folded, "é".repeat(80));

  const site = { callsign: "KE8OIR" };
  const host = { apex: "ke8oir.com" };
  const events = normalizeEvents(
    [
      { title: "Net, weekly", start: "2026-11-14 10:00", end: "2026-11-14 12:00", location: "Here; there" },
      { title: "Swap", start: "2026-12-05", end: "2026-12-06" },
    ],
    { warn: () => {} },
  );
  const text = buildCalendar(events, { site, host, absUrl: (p) => `https://ke8oir.com${p}`, name: "Test" });
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(text), "every line break must be CRLF");
  assert.match(text, /DTSTART:20261114T150000Z/);
  assert.match(text, /DTEND:20261114T170000Z/);
  assert.match(text, /SUMMARY:Net\\, weekly/);
  assert.match(text, /LOCATION:Here\\; there/);
  assert.match(text, /DTSTART;VALUE=DATE:20261205/);
  assert.match(text, /DTEND;VALUE=DATE:20261207/); // exclusive: day after the last day
  assert.equal(icsUtc(0), "19700101T000000Z");
});
