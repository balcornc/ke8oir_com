// /events/<id>.ics: one single-event calendar file per event, for the
// "Add to calendar" links.
export default class {
  data() {
    return {
      pagination: { data: "cal.all", size: 1, alias: "ev" },
      permalink: (data) => `/events/${data.ev.id}.ics`,
      eleventyExcludeFromCollections: true,
      sitemap: false,
    };
  }

  render(data) {
    return this.icsCalendar([data.ev], data.ev.title);
  }
}
