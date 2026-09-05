import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.kdtvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the whole table server-rendered. every row is a link to the
// company's own address whose aria-label says everything in one breath:
// "Abridge — Generative AI for clinical conversations, Digital Health,
// Series D (opens in a new tab)". the label is read from the back — the
// last piece is the stage, the one before it the sector, and the name stands
// before the dash — so a description with its own commas stays whole. the
// class names carry build hashes, so only their stable prefix is matched.

const ROW = /<a class="PortfolioTable_row[^"]*" href="(https?:\/\/[^"]+)"[^>]*aria-label="([^"]+?)\s*\(opens in a new tab\)"/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#x27;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, site, label] of html.matchAll(ROW)) {
		const text = clean(label);
		const dash = text.indexOf(' — ');
		const name = dash > 0 ? text.slice(0, dash) : text;
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const parts = text
			.slice(dash > 0 ? dash + 3 : name.length)
			.split(',')
			.map((p) => p.trim());
		// the stage and sector close the label; whatever precedes them is the
		// description and stays out of the category
		companies.push({
			name,
			category: parts.slice(-2).filter(Boolean).join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('kdt: no companies in the portfolio table');
	}

	return companies;
}
