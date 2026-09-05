import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.theventurecollective.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt, rendered on the server: the cards are in the html, but no company is
// named in text. each card is built around two pictures — the company's own
// photograph and its logo — both filed under the company's name, and it is
// the photograph's filename that names the company here.
//
// the small icon on each card is the theme the fund files it under, and the
// filename says which: world preservation, life improvement, or digital
// infrastructure.

const CARD = /(?=<div data-aos="fade-up"[^>]*class="relative overflow-hidden)/;
const PHOTO = /background:url\(\/_nuxt\/img\/([^.)]+)/;
const SITE = /<a href="(https?:\/\/[^"]+)"/;
const THEME = /\/_nuxt\/img\/([^.]+)\.[^.]+\.png" class="portfolio-icon/;

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.slice(html.indexOf('<body')).split(CARD).slice(1)) {
		const slug = card.match(PHOTO)?.[1] ?? '';
		if (!slug) continue;
		const name = capitalize(slug.replace(/-/g, ' '));
		if (seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: capitalize((card.match(THEME)?.[1] ?? '').replace(/-/g, ' ')),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('tvc: no companies on the portfolio page');
	}

	return companies;
}
