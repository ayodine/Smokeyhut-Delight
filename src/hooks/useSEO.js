import { useEffect } from 'react';

const BASE_TITLE = 'Smokeyhut Delight';
const BASE_URL   = 'https://smokeyhutdelight.com';

/**
 * Dynamically updates page <title>, meta description, canonical, and OG tags.
 * Call in each storefront page component.
 *
 * @param {{ title: string, description: string, path?: string, image?: string }} options
 */
export function useSEO({ title, description, path = '', image }) {
  useEffect(() => {
    const fullTitle = title
      ? `${title} | ${BASE_TITLE}`
      : `${BASE_TITLE} – Best Firewood Grilled Guineafowl in Lagos`;

    const ogImage = image || `${BASE_URL}/HERO.png`;
    const canonical = `${BASE_URL}${path}`;

    document.title = fullTitle;

    setMeta('name', 'description', description);

    // Canonical
    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.setAttribute('href', canonical);

    // Open Graph
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', ogImage);

    // Twitter
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', ogImage);

    return () => {
      // Restore base title on unmount (optional — next page will overwrite anyway)
      document.title = `${BASE_TITLE} – Best Firewood Grilled Guineafowl in Lagos`;
    };
  }, [title, description, path, image]);
}

function setMeta(attr, key, content) {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
