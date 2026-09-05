import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.leadoutcapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page. every card opens with its
// status and sector as data attributes, then names the company in a link to
// its own address and gives the year the fund came in. "Active" is the
// default status and says nothing; an acquisition means the fund is out,
// while "Inactive" is a company that folded rather than an exit, so it is
// kept only as the word.

const ITEM = /<div data-status="([^"]*)" data-sector="([^"]*)" role="listitem"[^>]*>([\s\S]*?)(?=<div data-status="|<\/div>\s*<\/div>\s*<\/div>\s*$)/g;
const NAME_LINK = /<a href="(https?:\/\/[^"]+)"[^>]*class="text-block">([^<]*)<\/a>/;
const YEAR = /class="text-block-2">(\d{4})</;

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

// the category is comma-joined, so a sector holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const [, status, sector, body] = m;
		const link = body.match(NAME_LINK);
		const name = clean(link?.[2] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				tag(sector),
				body.match(YEAR)?.[1] ?? '',
				/^active$/i.test(status) ? '' : tag(status),
				/acquired/i.test(status) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: link?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('leadout: no companies on the portfolio page');
	}

	return companies;
}
