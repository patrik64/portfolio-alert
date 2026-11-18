import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nxtp.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a page of the fund's own since the move off webflow on 2026-11-16: the
// portfolio is written into the page whole, as a list the page's script draws
// the grid and its filters from — a company each with its name, its site, the
// verticals the fund files it under ("Fintech & Payments"), the countries it
// works in and its status ("Active", "Exit"). the verticals and countries are
// kept as tags, an exit with the Exited tag.
//
// the old site named its companies only in its logos' file names, from which
// some were read otherwise than the fund now writes them; each of those is kept
// under the name it was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	asteras: 'Asteraslab',
	'cargo sapiens': 'cargoSapiens',
	'frete.com': 'Frete'
};

const DATA = /<script\b[^>]*\bid="pf-data"[^>]*>([\s\S]*?)<\/script>/;
const EXIT = /^exit(ed)?$/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	name?: unknown;
	site?: unknown;
	vert?: unknown;
	geo?: unknown;
	status?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v : [v]).map(text).filter(Boolean);

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const data = html.match(DATA)?.[1];
	if (!data) {
		throw new Error('nxtp: the portfolio is no longer written into the page');
	}
	const entries = JSON.parse(data) as Entry[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const written = text(entry.name);
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = text(entry.site);
		companies.push({
			name,
			category: [...list(entry.vert).map(tag), ...list(entry.geo).map(tag), EXIT.test(text(entry.status)) ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('nxtp: no companies in the portfolio');
	}

	return companies;
}
