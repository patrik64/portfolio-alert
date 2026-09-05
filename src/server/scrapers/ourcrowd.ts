import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ourcrowd.com';
const PAGE_URL = `${BASE_URL}/portfolio/all`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio page ships an empty container and a react bundle, but the
// whole portfolio is written into the html above it as a json array. the app
// opens on that array and never asks for more, and each of the page's other
// tabs — companies, vc funds, alternatives, exits — is served that same array
// and filters it in the browser. so /portfolio/all is all of it, in one
// request.
//
// the fund does not only back companies: it also gives its members access to
// other managers' funds, and those sit in the same grid. they are kept, since
// the grid is the portfolio, and so is what each card says of itself — the
// card over Maniv Mobility reads "Venture Fund • Mobility", and the ones over
// the companies read "Startup" or "Late-Stage", which is all that tells SpaceX
// and Anthropic from the rest of the grid.
//
// the sector reads a flat "Fund" for most of the vehicles, so their cards end
// up saying "Venture Fund • Fund". the type says that better, and the sector
// gives way to it.
//
// whether a company has been exited is not on the card at all — the fund keeps
// it for the Exits tab — but it is in the array, and it is kept.
//
// the fund publishes no link out to a company's own site, on the grid or on
// its page for the company, so an address here is the fund's page. two entries
// have no page and keep no address, the way the card drops its link for them.

const ARRAY = /\bvar\s+lightPortfolioCompanies\s*=/;

// the fund files a late-stage company as a Private Company and renames it on
// the card. the card's word is the one kept
const LATE_STAGE = 'Private Company';

interface Entry {
	title?: string;
	sectorName?: string;
	assetType?: string;
	isExit?: boolean;
	urlName?: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the array is cut out by counting brackets, so that a bracket inside a name
// or a slogan cannot end it early
const arrayAt = (source: string, from: number) => {
	let depth = 0;
	let inString = false;
	for (let at = from; at < source.length; at++) {
		const char = source[at];
		if (inString) {
			if (char === '\\') at++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '[') depth++;
		else if (char === ']' && --depth === 0) return source.slice(from, at + 1);
	}
	return '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.search(ARRAY);
	const opens = at === -1 ? -1 : html.indexOf('[', at);
	const literal = opens === -1 ? '' : arrayAt(html, opens);
	if (!literal) {
		throw new Error('ourcrowd: the portfolio is no longer written into the page');
	}

	let entries: Entry[];
	try {
		entries = JSON.parse(literal) as Entry[];
	} catch {
		throw new Error('ourcrowd: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const written = clean(entry.assetType ?? '');
		const type = written === LATE_STAGE ? 'Late-Stage' : written;
		const sector = tag(entry.sectorName ?? '');
		const page = clean(entry.urlName ?? '');
		companies.push({
			name,
			category: [
				tag(type),
				type && sector === 'Fund' ? '' : sector,
				entry.isExit ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: page ? `${BASE_URL}/companies/${page}` : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('ourcrowd: no companies in the portfolio');
	}

	return companies;
}
