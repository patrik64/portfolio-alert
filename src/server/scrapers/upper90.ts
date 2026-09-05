import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://upper90.io/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace 7.1: the whole portfolio is one gallery section of logos, all of
// it server-rendered, one <figure class="gallery-grid-item"> per company. the
// alt text names the company, and is the only place a name appears — there are
// no captions, no sectors and no exit badges, so every company comes back with
// an empty category.
//
// a handful of the alts were pasted from the company's own page title
// ("Comfreight | Load Board Marketplace | Freight Payments"), so everything
// from the first pipe on is a tagline, not part of the name. one logo was
// uploaded with no alt at all, leaving squarespace to fall back to the
// filename ("valoreo.png") — that still names the company, once the extension
// goes. that same one is the single card the fund never linked, so it is the
// only row without a url.

const ITEM = '<figure class="gallery-grid-item';
const ALT = /alt="([^"]*)"/;
const HREF = /href="\s*(https?:\/\/[^"\s]+)"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const alt = (item.match(ALT)?.[1] ?? '').split('|')[0].replace(/\s+/g, ' ').trim();
		// a filename standing in for the alt is lowercase where the brand is not
		// ("valoreo.png"), so that reading alone gets its first letter back
		const file = alt.match(/^(.+)\.(?:png|jpe?g|svg|webp|gif)$/i)?.[1];
		const name = file ? file.charAt(0).toUpperCase() + file.slice(1) : alt;
		if (!name || seen.has(name)) continue;
		seen.add(name);

		companies.push({ name, category: '', url: item.match(HREF)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('upper90: no companies in the portfolio gallery');
	}

	return companies;
}
