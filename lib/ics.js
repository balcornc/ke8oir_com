// Minimal, dependency-free iCalendar (RFC 5545) writer.
//
// Times are written in UTC ("...Z") so no VTIMEZONE block is needed and DST
// is already baked into the instant. Output is deterministic for a given
// commit: DTSTAMP comes from the event's optional `updated` field (or its
// start), never from the build clock.

import { addDaysYmd, icsUtc } from "./time.js";

const CRLF = "\r\n";

export function escapeText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to <= 75 octets, never splitting a UTF-8 character. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    if (bytes + len > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    current += ch;
    bytes += len;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

const dateOnly = (ymd) => ymd.replaceAll("-", "");

function stampFor(ev) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ev.updated)) return `${dateOnly(ev.updated)}T000000Z`;
  return icsUtc(ev.startMs);
}

export function veventLines(ev, { host, absUrl }) {
  const lines = ["BEGIN:VEVENT", `UID:${ev.id}@${host.apex}`, `DTSTAMP:${stampFor(ev)}`, `LAST-MODIFIED:${stampFor(ev)}`];

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.startYmd)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(addDaysYmd(ev.endYmd, 1))}`);
  } else {
    lines.push(`DTSTART:${icsUtc(ev.startMs)}`);
    if (ev.endMs != null) lines.push(`DTEND:${icsUtc(ev.endMs)}`);
  }

  lines.push(`SUMMARY:${escapeText(ev.title)}`);

  const place = [ev.location, ev.address].filter(Boolean).join(", ");
  if (place) lines.push(`LOCATION:${escapeText(place)}`);

  const detailUrl = ev.specialUrl ? absUrl(ev.specialUrl) : ev.link || "";
  const descParts = [ev.description];
  if (detailUrl) descParts.push(`More info: ${detailUrl}`);
  const description = descParts.filter(Boolean).join("\n\n");
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (detailUrl) lines.push(`URL:${detailUrl}`);

  lines.push(`CATEGORIES:${escapeText(ev.typeLabel.toUpperCase())}`);
  lines.push("STATUS:CONFIRMED", "TRANSP:TRANSPARENT", "END:VEVENT");
  return lines;
}

export function buildCalendar(events, { site, host, absUrl, name }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${site.callsign}//${host.apex}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];
  for (const ev of events) lines.push(...veventLines(ev, { host, absUrl }));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
