import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://brightercapital.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// one hand-written page: under a title per group, "Select Seasoned Investments",
// "2024 Investments" and so on back to "Select SPV Investments", a card per company
// with its logo linking its site, its name, and on most the stages the fund came in
// at ("Angel, Seed"). the year in a title is kept as a tag, and SPV.
const TOKEN =
	/class="bc-title[^"]*"[^>]*>([\s\S]*?)<\/|<div class="investment">([\s\S]*?)<div class="desc">\s*<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>([\s\S]*?)<\/div>/g;
const SITE = /\bhref="(https?:\/\/[^"]+)"/;
const YEAR = /\b(\d{4})\b/;
const SPV = /\bSPV\b/;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let group = '';
	for (const [, title, logo, shown, stages] of html.matchAll(TOKEN)) {
		if (title !== undefined) {
			const words = clean(title);
			group = words.match(YEAR)?.[1] ?? (SPV.test(words) ? 'SPV' : '');
			continue;
		}
		const name = clean(shown);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [clean(stages), group].filter(Boolean).join(', '),
			url: logo.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('brighter: no companies on the page');
	}

	return companies;
}
