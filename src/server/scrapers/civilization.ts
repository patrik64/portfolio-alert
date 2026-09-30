import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.civilizationventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: under four featured companies, the portfolio is a list of every
// company — its name, a line about it (still a placeholder on many), the
// categories the filter reads and a link. "Exits" is one of those
// categories and marks the companies the fund is out of; an exit's link is
// often the news of the sale, as the fund has it. the filter runs in the
// browser, so the page holds every company.

const ITEM = /(?=<div\b[^>]*\bclass="portfolio-item w-dyn-item")/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const CATEGORY = /\bfs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio-button\b/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		// an item ends with its link; what follows the last of them is not its own
		const linked = chunk.match(SITE);
		const item = linked ? chunk.slice(0, (linked.index ?? 0) + linked[0].length) : chunk;
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const categories = [...item.matchAll(CATEGORY)].map(([, category]) => tag(category));
		const exited = categories.some((c) => /^exits?$/i.test(c));
		const site = unescape(linked?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...categories.filter((c) => !/^exits?$/i.test(c)), exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('civilization: no companies on the portfolio page');
	}

	return companies;
}
