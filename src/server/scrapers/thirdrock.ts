import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.thirdrockventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the grid is logos only — no company is named in text and none is linked to
// its own site. what each tile does carry is the slug the fund gave it and the
// ids of the filters it answers to, and the filters' own dropdown spells those
// ids out: what the company works on, and whether it is private, public or
// acquired.
//
// so the slug names the company ("syremis-therapeutics" -> Syremis
// Therapeutics) and each points at its page on the fund's site.

const ITEM = 'js-portfolio-company"';
const SLUG = /data-slug="([^"]+)"/;
const FOCUS = /data-focus="(\d+)"/;
const STATUS = /data-status="(\d+)"/;
const DETAIL = /data-url="(https?:\/\/[^"]+)"/;
const OPTION = /<option[^>]*value="(\d+)"[^>]*>([^<]{2,60})<\/option>/g;

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

	const labels = new Map<string, string>();
	for (const [, id, label] of html.matchAll(OPTION)) labels.set(id, label.trim());

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const slug = item.match(SLUG)?.[1] ?? '';
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);

		const status = labels.get(item.match(STATUS)?.[1] ?? '') ?? '';
		companies.push({
			name: capitalize(slug.replace(/-/g, ' ')),
			category: [
				labels.get(item.match(FOCUS)?.[1] ?? '') ?? '',
				// "Private" is what a company that has neither listed nor been
				// bought reads, and says nothing
				/^private$/i.test(status) ? '' : status
			]
				.filter(Boolean)
				.join(', '),
			url: item.match(DETAIL)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('thirdrock: no companies on the portfolio page');
	}

	return companies;
}
