import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.actions.capital/founders';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole list on the one page — but drawn as founders rather
// than companies: every card is a person, and the company stands beside
// them with its stage, its industry and a link to its own address. the
// companies are what is collected, so co-founders of the same one fold
// into a single row.

const ITEM = /<a href="(https?:\/\/[^"]+)"[^>]*class="founder w-inline-block">([\s\S]*?)<\/a>/g;
const COMPANY = /class="founder-company">([^<]*)</;
const STAGE = /Stage<\/h4>\s*<div[^>]*>([^<]*)</;
const INDUSTRY = /Industry<\/h4>\s*<div[^>]*>([^<]*)</;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

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
	for (const [, site, body] of html.matchAll(ITEM)) {
		const name = clean(body.match(COMPANY)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [tag(body.match(INDUSTRY)?.[1] ?? ''), tag(body.match(STAGE)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('actions: no companies on the founders page');
	}

	return companies;
}
