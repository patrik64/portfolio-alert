import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://toyota.ventures/portfolio.html';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page: one section per company, named in its heading, with
// the fund it belongs to — frontier, climate, or both — as the section's
// class. a company that still has a site of its own carries a "learn more"
// button to it; the ones that do not are mostly long since wound up or
// bought.

const SECTION = /(?=<section id="[^"]*" class="portfolio-wrapper)/;
const CLASSES = /<section id="[^"]*" class="portfolio-wrapper ([^"]*)"/;
const NAME = /<h3>([^<]*)<\/h3>/;
const SITE = /<a class="btn" href="(https?:\/\/[^"]+)"/;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(SECTION).slice(1)) {
		const name = (section.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: (section.match(CLASSES)?.[1] ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.map(capitalize)
				.join(', '),
			url: section.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('toyota: no companies on the portfolio page');
	}

	return companies;
}
