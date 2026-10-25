// Directory data for every page in src/special-events/.
// Gives each page its layout, URL, and computed fields so the front matter
// stays simple (see starters/special-event.md).

import { getHost, getSite, normalizeWhen } from "../../lib/events.js";

const osm = (q) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
const isPlaceholder = (s) => typeof s === "string" && s.includes("[TODO");

export default {
  layout: "layouts/special-event.njk",
  tags: ["specialEvent"],
  permalink: "/special-events/{{ page.fileSlug }}/",
  ogType: "website",

  eleventyComputed: {
    // Normalized dates/times (see lib/events.js). Required: `start`.
    when: (data) => {
      if (!data.start) {
        throw new Error(`src/special-events/${data.page.fileSlug}: front matter is missing "start".`);
      }
      return normalizeWhen(data, {
        defaultHours: getSite().defaultEventHours ?? 2,
        label: `special event "${data.page.fileSlug}"`,
      });
    },

    map_link: (data) => {
      if (data.map_url) return data.map_url;
      if (data.address && !isPlaceholder(data.address)) return osm(data.address);
      return "";
    },

    // Social-preview image: explicit og_image, else the first gallery photo.
    ogImage: (data) => data.og_image || data.gallery?.[0]?.src || undefined,
    ogImageAlt: (data) => data.og_image_alt || data.gallery?.[0]?.alt || undefined,

    // Link-preview text: explicit description, else tagline, else the first
    // paragraph of the explainer.
    description: (data) => {
      if (data.description) return data.description;
      if (data.tagline) return data.tagline;
      const ex = Array.isArray(data.explainer) ? data.explainer[0] : data.explainer;
      return ex ? String(ex).slice(0, 200) : undefined;
    },

    // schema.org Event markup (helps search engines show event details).
    headExtra: (data) => {
      const w = data.when;
      if (!w || data.sample) return "";
      const host = getHost();
      const ld = {
        "@context": "https://schema.org",
        "@type": "Event",
        name: data.title,
        startDate: w.allDay ? w.startYmd : w.startIso,
        ...(w.allDay ? { endDate: w.endYmd } : w.endIso ? { endDate: w.endIso } : {}),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        url: `${host.url}/special-events/${data.page.fileSlug}/`,
        ...(data.location_name
          ? { location: { "@type": "Place", name: data.location_name, ...(data.address && !isPlaceholder(data.address) ? { address: data.address } : {}) } }
          : {}),
        ...(data.tagline ? { description: data.tagline } : {}),
      };
      // Escape "<" so the JSON can never close the script tag early.
      const json = JSON.stringify(ld).replace(/</g, "\\u003c");
      return `<script type="application/ld+json">${json}</script>`;
    },
  },
};
