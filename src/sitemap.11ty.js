// /sitemap.xml: every public HTML page. Excludes the 404 page, sample pages,
// and anything marked `noindex` or `sitemap: false`.
export default class {
  data() {
    return { permalink: "/sitemap.xml", eleventyExcludeFromCollections: true, sitemap: false };
  }

  render(data) {
    const urls = data.collections.all
      .filter((p) => p.url && p.url.endsWith("/") && p.data.sitemap !== false && !p.data.noindex && !p.data.sample)
      .map((p) => p.url)
      .sort();
    const body = urls.map((u) => `  <url><loc>${this.xml(this.absUrl(u))}</loc></url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  }
}
