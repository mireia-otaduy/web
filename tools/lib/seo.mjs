/**
 * Generadores de SEO y metadatos: URLs canónicas, sitemap con hreflang,
 * robots.txt, manifiesto web y datos estructurados JSON-LD.
 */

/** URL absoluta y canónica de una página en un idioma (index.html se publica como directorio). */
export function pageUrl(site, lang, pageKey) {
  const file = site.pages[pageKey].files[lang];
  const clean = file === 'index.html' ? '' : file;
  return `${site.url}/${site.languages[lang].dir}${clean}`;
}

/** Ruta del archivo dentro de public/ (por ejemplo "en/technologies.html"). */
export function pageOutputPath(site, lang, pageKey) {
  return `${site.languages[lang].dir}${site.pages[pageKey].files[lang]}`;
}

const xmlEscape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Etiquetas <link rel="alternate" hreflang> de una página (incluye x-default). */
export function alternateLinks(site, pageKey) {
  const langs = Object.keys(site.languages);
  const tags = langs.map(
    (lang) => `<link rel="alternate" hreflang="${site.languages[lang].hreflang}" href="${pageUrl(site, lang, pageKey)}">`
  );
  tags.push(`<link rel="alternate" hreflang="x-default" href="${pageUrl(site, site.defaultLang, pageKey)}">`);
  return tags.join('\n  ');
}

/** sitemap.xml con todas las páginas y sus versiones en otros idiomas. */
export function buildSitemap(site) {
  const langs = Object.keys(site.languages);
  const entries = [];
  for (const pageKey of Object.keys(site.pages)) {
    for (const lang of langs) {
      const alternates = langs
        .map(
          (other) =>
            `    <xhtml:link rel="alternate" hreflang="${site.languages[other].hreflang}" href="${xmlEscape(pageUrl(site, other, pageKey))}"/>`
        )
        .concat(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(pageUrl(site, site.defaultLang, pageKey))}"/>`
        )
        .join('\n');
      entries.push(
        `  <url>\n    <loc>${xmlEscape(pageUrl(site, lang, pageKey))}</loc>\n${alternates}\n    <priority>${site.pages[pageKey].priority}</priority>\n  </url>`
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

export function buildRobots(site) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

export function buildManifest(site, description) {
  return JSON.stringify(
    {
      name: site.name,
      short_name: 'LCC',
      description,
      lang: 'es',
      start_url: './',
      display: 'browser',
      theme_color: site.themeColor,
      background_color: site.themeColor,
      icons: [
        { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'assets/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    null,
    2
  );
}

/** Datos estructurados (schema.org) de una página. */
export function buildJsonLd(site, lang, pageKey, texts) {
  const base = site.url;
  const orgId = `${base}/#organization`;
  const graph = [
    {
      '@type': 'Organization',
      '@id': orgId,
      name: site.name,
      legalName: site.legalName,
      url: `${base}/`,
      logo: `${base}/assets/img/logo-lcc.png`,
      foundingDate: String(site.founded),
      email: site.email,
      telephone: site.phone.tel,
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        postalCode: site.address.postalCode,
        addressLocality: site.address.city,
        addressRegion: site.address.region,
        addressCountry: site.address.countryCode
      }
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      url: `${base}/`,
      name: site.name,
      publisher: { '@id': orgId },
      inLanguage: Object.values(site.languages).map((l) => l.hreflang)
    },
    {
      '@type': pageKey === 'contact' ? 'ContactPage' : 'WebPage',
      '@id': `${pageUrl(site, lang, pageKey)}#webpage`,
      url: pageUrl(site, lang, pageKey),
      name: texts.title,
      description: texts.description,
      inLanguage: site.languages[lang].hreflang,
      isPartOf: { '@id': `${base}/#website` },
      about: { '@id': orgId }
    }
  ];
  // "<" se escapa para que el JSON nunca pueda cerrar la etiqueta <script>.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
