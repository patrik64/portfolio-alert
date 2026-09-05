import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.questvp.com/portfolio.html';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hand-written html, the whole portfolio in one file. each card names the
// company, the sector it is filed under and its website, and says which of the
// fund's vehicles holds it — fund ii, iii, iv, or exited. only the last of
// those says anything about the company, so it is the only one kept.
//
// the divider heading the exited section carries the same data-fund attribute
// as the cards below it, so cards are found by their class rather than by it.

const CARD = '<div class="port-card"';
const FUND = /^[^>]*data-fund="([^"]*)"/;
const NAME = /class="port-name">([^<]*)</;
const SECTOR = /class="port-sector">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="port-website-btn"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&mdash;/g, '—')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = unescape(card.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				unescape(card.match(SECTOR)?.[1] ?? '').trim(),
				card.match(FUND)?.[1] === 'exited' ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('quest: no companies on the portfolio page');
	}

	return companies;
}
