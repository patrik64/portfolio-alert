import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://metaplanet.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, and the page hands its own app the whole portfolio: a record each
// with the company's name, what the fund files it under, where it is, its
// address, the year the fund came in and whether it still holds it.
//
// one record is named Stealth Co 1 and marked as such. the fund gives it an
// address all the same, so a name could be taken from that — but naming a
// company the fund is deliberately not naming is not this scraper's business,
// and a placeholder is not a newcomer to publish either way.
//
// nine of the investments were made through a special purpose vehicle, which
// the record says. that is how the fund put the money in rather than anything
// about the company, so it goes the way other funds' vehicles do — the
// companies stay.
//
// the year is left alone for the same reason. Active is the state a company is
// in unless something has happened; the other one is kept in the fund's own
// words, which are the words on its filter.

const PAYLOAD = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^active$/i;

interface Company {
	name?: string;
	category?: string;
	country?: string;
	state?: string;
	website?: string;
	stealth?: string;
}
interface Payload {
	props?: { pageProps?: { rawData?: Company[] } };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const payload = html.match(PAYLOAD)?.[1];
	if (!payload) {
		throw new Error('metaplanet: the page no longer carries its own data');
	}
	const listed = (JSON.parse(payload) as Payload).props?.pageProps?.rawData ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of listed) {
		// a company the fund has not announced
		if (clean(company.stealth ?? '')) continue;

		const name = clean(company.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const state = clean(company.state ?? '');
		companies.push({
			name,
			category: [
				clean(company.category ?? ''),
				clean(company.country ?? ''),
				DEFAULT_STATE.test(state) ? '' : state
			]
				.filter(Boolean)
				.join(', '),
			url: clean(company.website ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('metaplanet: no companies in the portfolio data');
	}

	return companies;
}
