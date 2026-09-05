import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mangocapitalinc.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio on the fund's own page is a wall of logos: each card carries a
// picture, the founders' names, the site and whether the company was acquired,
// and nowhere on it is the company written down. what the page does carry is a
// link to the brief the fund keeps for agents to read — a single markdown file
// the fund publishes itself, whose portfolio table names every company it has
// backed, alongside the same sites and outcomes the cards show. so the page is
// read for that link, and the brief for the portfolio.
//
// the brief holds two tables. the one taken here is the fund's own portfolio,
// which is the table that gives a website for each company; the other is the
// list of what the fund's partner backed at an earlier firm, which the fund's
// page keeps apart as Other Investments and which is left out.
//
// what the fund says about a company that has gone is kept in its own words —
// Acquired by Cisco, Shutdown, Realized — and Active, which is what it says of
// a company still going, is left off as the ordinary case. a name is sometimes
// followed by what the company used to be called, which is not what it is
// called now, so only the name itself is taken.

const BRIEF_LINK = /<a\b[^>]*?\bhref="(https:\/\/github\.com\/[^"]+\/blob\/[^"]+)"/;
const HAS = (header: string[], want: string) => header.some((cell) => cell === want);

const clean = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is joined with commas, so a comma inside one is written as a
// slash instead
const part = (s: string) => clean(s.replace(/\s*\([^)]*\)/g, '')).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);

	const link = page.match(BRIEF_LINK)?.[1];
	if (!link) {
		throw new Error('mango: the page no longer links the brief the portfolio is read from');
	}
	const brief = await fetchText(
		link.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
	);

	const companies: ScrapedCompany[] = [];
	let header: string[] | null = null;

	for (const line of brief.split('\n')) {
		const row = line.trim();
		if (!row.startsWith('|')) {
			header = null;
			continue;
		}
		const cells = row.replace(/^\||\|$/g, '').split('|');

		if (!header) {
			const said = cells.map(clean);
			// the portfolio table is the one that gives each company a website
			if (HAS(said, 'Company') && HAS(said, 'Website')) header = said;
			continue;
		}
		if (cells.length !== header.length || /^[\s:-]*$/.test(row.replace(/\|/g, ''))) continue;

		const columns = header;
		const said = (want: string) => cells[columns.indexOf(want)] ?? '';

		// a name is sometimes followed by what the company used to be called
		const name = clean(said('Company').replace(/\s*\([^)]*\)\s*$/, ''));
		if (!name) continue;

		const site = said('Website').match(/\]\((https?:\/\/[^)\s]+)\)/)?.[1] ?? '';
		const status = part(said('Status'));

		companies.push({
			name,
			category: [part(said('Theme / Sector')), part(said('Location')), status === 'Active' ? '' : status]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('mango: the brief holds no portfolio table');
	}

	return companies;
}
