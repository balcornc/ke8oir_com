// Eleventy configuration for ke8oir.com
//
// Static output only. Everything here runs at build time on your computer (or
// in GitHub Actions); nothing in dist/ needs Node on the server.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DATA_DIR,
  getHost,
  getSite,
  listSpecialSlugs,
  normalizeEvents,
  parseYaml,
  splitEvents,
} from "./lib/events.js";
import { buildCalendar } from "./lib/ics.js";
import { fmtYear } from "./lib/time.js";

// "Now" for the whole build. Override for testing: BUILD_NOW=2026-12-01T12:00:00Z npm run build
const NOW_MS = process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now();
if (Number.isNaN(NOW_MS)) throw new Error(`BUILD_NOW "${process.env.BUILD_NOW}" is not a valid date.`);

const SRC = "src";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export default function (eleventyConfig) {
  // ---- Data -------------------------------------------------------------
  // YAML data files. JSON_SCHEMA keeps unquoted dates as strings (no silent
  // UTC conversion). See lib/events.js.
  eleventyConfig.addDataExtension("yaml,yml", (contents, filePath) => parseYaml(contents, filePath));

  eleventyConfig.addGlobalData("host", () => getHost());
  eleventyConfig.addGlobalData("build", () => ({
    nowIso: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
    year: fmtYear(NOW_MS),
  }));

  eleventyConfig.addGlobalData("cal", () => {
    const site = getSite();
    const events = normalizeEvents(
      parseYaml(fs.readFileSync(path.join(DATA_DIR, "events.yaml"), "utf8"), "data/events.yaml"),
      { specialSlugs: listSpecialSlugs(), defaultHours: site.defaultEventHours ?? 2 },
    );
    const { upcoming, past } = splitEvents(events, NOW_MS);
    return { all: events, upcoming, past };
  });

  // ---- Filters ----------------------------------------------------------
  const host = () => getHost();

  eleventyConfig.addFilter("absUrl", (p) => (/^https?:\/\//.test(p) ? p : host().url + p));

  // Cache-busting: /assets/css/style.css -> /assets/css/style.css?v=<hash>.
  // Lets .htaccess give CSS/JS a one-year immutable cache safely.
  const hashCache = new Map();
  eleventyConfig.addFilter("asset", (p) => {
    const file = path.join(SRC, p);
    if (!hashCache.has(file)) {
      const hash = fs.existsSync(file)
        ? crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 10)
        : "missing";
      hashCache.set(file, hash);
    }
    return `${p}?v=${hashCache.get(file)}`;
  });

  eleventyConfig.addFilter("take", (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []));

  // Special event pages: split into upcoming / past using the same
  // "when does it stop being upcoming" rule as regular events.
  eleventyConfig.addFilter("specialSplit", (items) => {
    const withWhen = (items ?? []).filter((i) => i.data.when);
    const upcoming = withWhen
      .filter((i) => i.data.when.effectiveEndMs > NOW_MS)
      .sort((a, b) => a.data.when.startMs - b.data.when.startMs);
    const past = withWhen
      .filter((i) => i.data.when.effectiveEndMs <= NOW_MS)
      .sort((a, b) => b.data.when.startMs - a.data.when.startMs);
    return { upcoming, past };
  });

  eleventyConfig.addFilter("regexEscape", (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  eleventyConfig.addFilter("xml", (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  );
  eleventyConfig.addFilter("icsCalendar", (events, name) =>
    buildCalendar(events, {
      site: getSite(),
      host: getHost(),
      absUrl: (p) => getHost().url + p,
      name,
    }),
  );

  // ---- Collections ------------------------------------------------------
  eleventyConfig.addCollection("specialEvents", (api) => api.getFilteredByTag("specialEvent"));

  // ---- Static files -----------------------------------------------------
  // Mapping form: copy src/assets -> dist/assets (explicit, no surprises).
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addWatchTarget("lib/");

  // ---- Friendly reminders at build time --------------------------------
  eleventyConfig.on("eleventy.before", () => {
    const files = [
      ...fs.readdirSync(DATA_DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(DATA_DIR, f)),
      ...walk(SRC).filter((f) => /\.(md|njk|html|js)$/.test(f)),
    ];
    let todos = 0;
    let samples = 0;
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      todos += (text.match(/\[TODO/g) ?? []).length;
      samples += (text.match(/^\s*sample:\s*true\s*$/gm) ?? []).length;
    }
    const site = getSite();
    const notes = [];
    if (samples) notes.push(`${samples} sample entr${samples === 1 ? "y" : "ies"} still marked "sample: true"`);
    if (todos) notes.push(`${todos} "[TODO" placeholder${todos === 1 ? "" : "s"} to fill in`);
    if (String(site.contact?.url ?? "").startsWith("#TODO")) notes.push("contact link in data/site.yaml is still a placeholder");
    if (notes.length) {
      console.warn(`\n[ke8oir] Before you publish: ${notes.join("; ")}.\n`);
    }
  });

  return {
    dir: {
      input: SRC,
      output: "dist",
      includes: "_includes",
      data: "../data", // data/*.yaml lives at the project root
    },
    templateFormats: ["njk", "md", "11ty.js"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
