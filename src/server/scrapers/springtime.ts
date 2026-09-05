import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://springtimeventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor, the portfolio in two galleries: the book itself,
// and beneath a heading of its own the companies that have closed.
//
// a tile is one block of markup with the company's name in bold, a line about
// what it does, and a "Categories:" line reading "Fintech | Active" or
// "Logistics | Exit" — pipe-separated, with the status always last.
//
// the fund also tags each tile for its filter buttons, which say the same
// thing about exits and add which of its three funds holds the company. the
// written line is used instead: it says more, and it is what a reader sees.
//
// nothing on the page links to a company, so no addresses.

const ITEM = /(?=<div class="e-gallery-item elementor-gallery-item)/;
const CLOSED_HEADING = 'Closed Portfolio Companies';
const NAME_BOLD = /<b>[\s\S]*?<font[^>]*>([\s\S]*?)<\/font>/;
const NAME_PLAIN = /<b>([\s\S]*?)<\/b>/;
const TITLE = /<div class="elementor-gallery-item__title">([\s\S]*?)<\/div>/;
const CATEGORIES = /Categories:\s*(.*)$/;
// "Active" is what a company still held reads
const HELD = /^active$/i;
const LEFT = /^exit(ed)?$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const closedFrom = html.indexOf(CLOSED_HEADING);
	let at = 0;

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		at = html.indexOf(item, at);
		const closed = closedFrom >= 0 && at > closedFrom;

		const bold = item.match(NAME_BOLD) ?? item.match(NAME_PLAIN);
		const name = clean(bold?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const written = clean(item.match(TITLE)?.[1] ?? '');
		const parts = (written.match(CATEGORIES)?.[1] ?? '')
			.split('|')
			.map((p) => p.trim())
			.filter(Boolean);
		const status = parts.pop() ?? '';

		companies.push({
			name,
			category: [
				...parts,
				closed ? 'Closed' : LEFT.test(status) ? 'Exited' : HELD.test(status) ? '' : status
			]
				.filter(Boolean)
				.join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('springtime: no companies on the portfolio page');
	}

	return companies;
}
