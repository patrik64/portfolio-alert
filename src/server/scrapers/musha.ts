import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.mushaventures.com';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio is the fund's front page, and the page it serves holds only
// what its own filters are set to show — the hundred and seventy-five it calls
// active or exited, as logo tiles with a country and a year. the forty-five it
// files as closed are filtered out before the page is written, and no tile
// carries what a company does.
//
// all of it is in the script the page preloads to run the explorer with: a
// record per company with the fund's sector for it, the country, the state it
// is in and its address. the script's name carries a build hash, so it is
// found by the page rather than written down here, and if the page stops
// naming it this stops with a complaint.
//
// two records are marked not visible — Hippo and Palantir, both of which the
// fund holds and neither of which it shows. they are left out, which is what
// makes the count come to the two hundred and twenty its own filter claims.
//
// the fund's word for a company that has gone under is Closed, which is what
// its filter says; the record calls it shut_down. active is the state a
// company is in unless something has happened, so only the other two are
// written down. the round and the year are on the tile as well, and are the
// shape of the investment rather than the company, so they are left there.

const BUNDLE = /"(\/assets\/portfolio-explorer-[A-Za-z0-9_-]+\.js)"/;
// the records are written as javascript rather than json, one object each
const RECORD = /\{id:`/g;
const VISIBLE = /visible:(!?[01])/;
const field = (name: string) => new RegExp(`\\b${name}:\`([^\`]*)\``);
// what the fund's own filter calls each state, and the one it does not name
const STATES: Record<string, string> = { exited: 'Exited', shut_down: 'Closed' };

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);

	const bundle = page.match(BUNDLE)?.[1];
	if (!bundle) {
		throw new Error('musha: the page no longer says where its portfolio is kept');
	}
	const script = await fetchText(`${BASE_URL}${bundle}`);

	// each record runs from its own id to the next one's
	const starts = [...script.matchAll(RECORD)].map((match) => match.index);
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let at = 0; at < starts.length; at++) {
		const record = script.slice(starts[at], starts[at + 1] ?? script.length);
		// a record the fund keeps but does not show
		if (record.match(VISIBLE)?.[1] !== '!0') continue;

		const name = clean(record.match(field('name'))?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const state = STATES[clean(record.match(field('status'))?.[1] ?? '')] ?? '';
		companies.push({
			name,
			category: [
				clean(record.match(field('category'))?.[1] ?? ''),
				clean(record.match(field('country'))?.[1] ?? ''),
				state
			]
				.filter(Boolean)
				.join(', '),
			url: clean(record.match(field('website'))?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('musha: no companies in the portfolio explorer');
	}

	return companies;
}
