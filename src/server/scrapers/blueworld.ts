import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://blueworld.group/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt, served whole: the portfolio is an accordion on the home page, a fold per
// company with its name, a line about its founders' mission and a link to its site.
// the list is drawn in a loop, so the first few come round again. the page says
// nothing of sector or stage, so the companies have no category.
const FOLD = /(?=<details\b)/;
const NAME = /<summary\b[^>]*>\s*<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const SITE = /\bhref="(https?:\/\/[^"]+)"/;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const folds = (await resp.text()).split(FOLD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const fold of folds) {
		const name = clean(fold.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// a fold ends at its own closing tag; what follows the last belongs to the page
		const url = fold.split('</details>')[0].match(SITE)?.[1] ?? '';
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('blueworld: no companies on the home page');
	}

	return companies;
}
