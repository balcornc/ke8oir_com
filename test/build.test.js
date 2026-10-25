// Checks the BUILT output in dist/. Run `npm run build` first (the npm
// `test` script does not build for you). These tests guard the things that
// fail silently on a real server.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHost, getSite } from "../lib/events.js";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const built = fs.existsSync(path.join(DIST, "index.html"));
const opts = { skip: built ? false : "dist/ not built; run `npm run build` first" };
const read = (f) => fs.readFileSync(path.join(DIST, f), "utf8");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test(".htaccess has no HTML entities and a correct, escaped host regex", opts, () => {
  const ht = read(".htaccess");
  assert.ok(!/&(#\d+|[a-z]+);/i.test(ht), "found an HTML entity in .htaccess (autoescape bug)");
  assert.match(ht, /RewriteCond %\{HTTP_HOST\} \^www\\\.ke8oir\\\.com\(:\[0-9\]\+\)\?\$ \[NC\]/);
  assert.match(ht, /RewriteRule \^ https:\/\/ke8oir\.com%\{REQUEST_URI\} \[R=301,L\]/);
  assert.match(ht, /ErrorDocument 404 \/404\.html/);
  assert.match(ht, /\.well-known/);
});

test("required root files exist", opts, () => {
  for (const f of [".htaccess", "404.html", "robots.txt", "sitemap.xml", "calendar.ics", "index.html"]) {
    assert.ok(fs.existsSync(path.join(DIST, f)), `${f} missing from dist/`);
  }
});

test("no third-party requests: scripts, stylesheets, fonts and images are all self-hosted", opts, () => {
  const { apex } = getHost(getSite());
  const ownHost = (h) => h === apex || h === `www.${apex}`;
  const offenders = [];
  for (const file of walk(DIST).filter((f) => /\.(html|css|js)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    // <script src>, <link href>, <img src>, CSS url(), @import. The site's own
    // absolute URLs (canonical, Open Graph) are fine; any OTHER host is not.
    const re = /(?:<script[^>]+src|<link[^>]+href|<img[^>]+src|url\(|@import)\s*=?\s*["']?(?:https?:)?\/\/([^/"'\s)>:]+)/gi;
    let m;
    while ((m = re.exec(text))) {
      if (!ownHost(m[1])) offenders.push(`${path.relative(DIST, file)} -> ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("CSP-safe: no inline scripts or inline style attributes", opts, () => {
  const bad = [];
  for (const file of walk(DIST).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    if (/<script(?![^>]*(src=|type="application\/ld\+json"))[^>]*>/i.test(html)) bad.push(`${file}: inline script`);
    if (/\sstyle\s*=/i.test(html)) bad.push(`${file}: style attribute`);
    if (/<style[\s>]/i.test(html)) bad.push(`${file}: <style> block`);
  }
  assert.deepEqual(bad, []);
});

test("every page has a title, description, canonical, and Open Graph tags", opts, () => {
  const pages = walk(DIST).filter((f) => f.endsWith(".html"));
  assert.ok(pages.length >= 7);
  for (const file of pages) {
    const html = fs.readFileSync(file, "utf8");
    const rel = path.relative(DIST, file);
    for (const needle of ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:image"', 'lang="en"']) {
      assert.ok(html.includes(needle), `${rel} is missing ${needle}`);
    }
  }
});

test("every <img> has alt text", opts, () => {
  for (const file of walk(DIST).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
      assert.match(tag, /\balt=/i, `${path.relative(DIST, file)}: ${tag}`);
    }
  }
});

test("calendar feed is CRLF-only and balanced", opts, () => {
  const ics = read("calendar.ics");
  assert.ok(!/[^\r]\n/.test(ics));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, (ics.match(/END:VEVENT/g) ?? []).length);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `long line: ${line}`);
});

test("no private data leaked: no phone numbers or street-address placeholders in output", opts, () => {
  for (const file of walk(DIST).filter((f) => /\.(html|ics|xml|txt)$/.test(f))) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(text), `phone-like number in ${path.relative(DIST, file)}`);
  }
});
