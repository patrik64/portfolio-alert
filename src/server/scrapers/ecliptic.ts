import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ecliptic.capital';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app over contentful: the page is an empty shell that one script
// renders, asking contentful for the portfolio with a space and a delivery
// token written into the script. the script's name is hashed per build, so
// it is read off the shell each run, and the space and token off it; then
// contentful answers with every company — the name, a line about it, its
// site and the type the fund files it under ("Energy Transition"), an
// entry of its own. nothing marks an exit.

const SCRIPT = /<script\b[^>]*\bsrc="([^"]*\/static\/js\/main\.[^"]+\.js)"/;
const SPACE = /\bspace\s*:\s*"([^"]+)"/;
const TOKEN = /\baccessToken\s*:\s*"([^"]+)"/;
const ENVIRONMENT = /\benvironment\s*:\s*"([^"]+)"/;
const STEALTH = /^stealth\b/i;

interface Link {
	sys?: { id?: string };
}

interface Entry {
	sys?: { id?: string };
	fields?: { name?: string; url?: string; type?: string; portfolioType?: Link | Link[] };
}

interface Listing {
	items?: Entry[];
	includes?: { Entry?: Entry[] };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const script = shell.match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('ecliptic: the page names no script to read the portfolio from');
	}
	const bundle = await fetchText(new URL(script, BASE_URL).href);
	const space = bundle.match(SPACE)?.[1];
	const token = bundle.match(TOKEN)?.[1];
	const environment = bundle.match(ENVIRONMENT)?.[1] ?? 'master';
	if (!space || !token) {
		throw new Error('ecliptic: the script names no contentful space to ask');
	}

	const listing = JSON.parse(
		await fetchText(
			`https://cdn.contentful.com/spaces/${space}/environments/${environment}/entries?content_type=portfolioCompany&include=1&limit=1000&access_token=${token}`
		)
	) as Listing;
	const types = new Map((listing.includes?.Entry ?? []).map((entry) => [entry.sys?.id, clean(entry.fields?.type ?? '')]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of listing.items ?? []) {
		const name = clean(entry.fields?.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const links = entry.fields?.portfolioType;
		companies.push({
			name,
			category: (Array.isArray(links) ? links : links ? [links] : [])
				.map((link) => tag(types.get(link.sys?.id) ?? ''))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(entry.fields?.url ?? '') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ecliptic: no companies in the portfolio contentful answers with');
	}

	return companies;
}
