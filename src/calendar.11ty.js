// /calendar.ics: subscribable feed of every event in data/events.yaml.
export default class {
  data() {
    return {
      permalink: "/calendar.ics",
      eleventyExcludeFromCollections: true,
      sitemap: false,
    };
  }

  render(data) {
    return this.icsCalendar(data.cal.all, `${data.site.callsign} · Middletown, OH ham radio events`);
  }
}
