import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://variant.fund/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress (custom theme): every company is an
// <a class="portfolio-item"> linking its own site, with the name in a
// portfolio-item__name span, the round and year in portfolio-item__meta, and
// the sector as a data-portfolio-categories slug that the filter chips label
// ("new-markets" -> "New Markets"). the six cards in the "Featured" rail repeat
// entries from the full list below it, so items are deduped by name.

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const labels = new Map<string, string>();
	for (const [, slug, label] of html.matchAll(
		/data-portfolio-filter data-filter-value="([^"]+)"[^>]*>([^<]*)<\/button>/g
	)) {
		labels.set(slug, decode(label));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, item] of html.matchAll(/<a class="portfolio-item"([\s\S]*?)<\/a>/g)) {
		const name = decode(item.match(/portfolio-item__name">([^<]*)</)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const slug = item.match(/data-portfolio-categories="([^"]*)"/)?.[1] ?? '';
		const meta = decode(item.match(/portfolio-item__meta type-meta">([^<]*)</)?.[1] ?? '');
		companies.push({
			name,
			category: [labels.get(slug) ?? '', meta].filter(Boolean).join(', '),
			url: item.match(/href="([^"]*)"/)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('variant: no companies on the page');
	}

	return companies;
}
