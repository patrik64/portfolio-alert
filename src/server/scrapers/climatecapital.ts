import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.climatecapital.co';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a single-page app on supabase: the portfolio page is an empty shell whose
// script asks the site's own function for the list ("fetch-portfolio",
// with the public key the script carries, as any visitor's browser does)
// and draws every company it answers with: the name, a line about it, the
// sectors it works in, where it is, the round it is at, the site, and the
// vehicles the fund holds it through — the "Network Fund", the "Syndicate"
// or the "Seed" fund. the script's address and the key are read from the
// page each run, as both change with a new build. the round is the
// company's latest, not the one the fund came in at, and is left out, as
// it would only age. a name carries notes of its own — an old name ("(fka
// Velma)"), a batch ("(YC S26)"), an alias ("<aka STOR>"), a legal form
// ("Inc.") — which are not part of it. nothing marks an exit.

const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/;
const PROJECT = /["'`](https:\/\/[a-z0-9]+\.supabase\.co)["'`]/;
const KEY = /["'`](eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+)["'`]/;
// notes after the name, and a legal form at its end
const NOTE = /\s*(?:\([^()]*\)|<[^<>]*>)\s*$/;
const FORM = /[\s,]+(?:inc\.?(?:\s+pbc)?|pbc|llc|ltd\.?|corp\.?|gmbh)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: unknown;
	sector?: unknown;
	location?: unknown;
	fund?: unknown;
	website?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v.map(text) : [text(v)]).filter(Boolean);

// the category is comma-joined, so a label holding a comma would read as two:
// "Carbon Removal, Measurement, and Markets" -> "Carbon Removal / Measurement
// and Markets"
const tag = (s: string) => s.replace(/,\s*and\s+/g, ' and ').replace(/\s*,\s*/g, ' / ');

// "Merino Energy (fka Velma)" -> "Merino Energy", "Skouria Inc. " -> "Skouria"
function nameOf(written: string): string {
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

// "www.arinna.xyz" is a site too; "NA" is not
function siteOf(written: string): string {
	if (!/\.[a-z]{2,}/i.test(written) || /\s/.test(written)) return '';
	return /^https?:\/\//i.test(written) ? written : `https://${written}`;
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const script = (await fetchText(PAGE_URL)).match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('climatecapital: the portfolio page loads no script');
	}
	const code = await fetchText(`${BASE_URL}${script}`);
	const project = code.match(PROJECT)?.[1];
	const key = code.match(KEY)?.[1];
	if (!project || !key) {
		throw new Error("climatecapital: the page's script names no backend to ask");
	}

	const resp = await fetch(`${project}/functions/v1/fetch-portfolio`, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/json',
			apikey: key,
			Authorization: `Bearer ${key}`
		},
		body: '{}'
	});
	if (!resp.ok) {
		throw new Error(`climatecapital: the portfolio would not load (${resp.status})`);
	}
	const answer = (await resp.json()) as { companies?: Company[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of answer.companies ?? []) {
		const name = nameOf(text(company?.name));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const funds = list(company.fund).flatMap((f) => f.split(/[,/;|]+/).map((s) => s.trim()));
		companies.push({
			name,
			category: [
				...list(company.sector).map(tag),
				tag(text(company.location)).replace(/^n\/?a$/i, ''),
				// the page's own link to it reads "our Seed Fund"
				...funds.map((f) => (/^seed$/i.test(f) ? 'Seed Fund' : tag(f)))
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: siteOf(text(company.website)) || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('climatecapital: no companies in the portfolio');
	}

	return companies;
}
