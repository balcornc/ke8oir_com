// /special-events/<slug>/event.ics: "Add to calendar" for each special event
// page, built from that page's own front matter so the page is self-contained.
export default class {
  data() {
    return {
      pagination: { data: "collections.specialEvents", size: 1, alias: "se" },
      permalink: (data) => `/special-events/${data.se.fileSlug}/event.ics`,
      eleventyExcludeFromCollections: true,
      sitemap: false,
    };
  }

  render(data) {
    const { se } = data;
    const d = se.data;
    const explainer = Array.isArray(d.explainer) ? d.explainer[0] : d.explainer;
    const ev = {
      id: `special-${se.fileSlug}`,
      title: d.title,
      typeLabel: "Special event",
      ...d.when,
      location: d.location_name || "",
      address: d.address && !String(d.address).includes("[TODO") ? d.address : "",
      description: d.tagline || explainer || "",
      link: "",
      specialUrl: `/special-events/${se.fileSlug}/`,
      updated: d.updated ? String(d.updated) : "",
    };
    return this.icsCalendar([ev], d.title);
  }
}
