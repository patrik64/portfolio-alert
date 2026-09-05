import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.newmarketsvp.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, and generous with it: the grid is bound to a data collection the page
// warms into itself before rendering, so the whole of it — the name, where the
// company works, whether the fund still holds it, its address and the fund's
// own page for it — is served as records rather than having to be read back
// out of the markup.
//
// the collection is taken by name. it is the only one warmed today, but a wix
// site warms whichever ones a page is bound to, and a team or a news
// collection arriving later should make this stop rather than turn people into
// companies.
//
// the fund keeps a page of its own for every company and the grid links there
// rather than out, but it also records the company's address where it still
// has one. that address is the better place to send a reader, so it is used
// where it exists; thirty-seven companies, nearly all of them long since sold,
// have none, and those keep the fund's page for them.
//
// a company is Current or Realized. Current is the state a company is in
// unless something has happened to it, so only Realized is written down.

const WARMUP = /<script type="application\/json" id="wix-warmup-data">([\s\S]*?)<\/script>/;
const COLLECTION = 'Companies';
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^current$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a town written "Chicago, IL" would read as
// two tags rather than one place
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

interface Record {
	companyTitle?: string;
	location?: string;
	website?: string;
	company_status?: string[];
	'link-portfolio-companies-companyTitle'?: string;
}
interface Warmup {
	appsWarmupData?: {
		dataBinding?: {
			dataStore?: { recordsByCollectionId?: Record_ };
		};
	};
}
type Record_ = { [collection: string]: { [id: string]: Record } };

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const warmup = html.match(WARMUP)?.[1];
	if (!warmup) {
		throw new Error('newmarkets: the page no longer warms its data into itself');
	}
	const records = (JSON.parse(warmup) as Warmup).appsWarmupData?.dataBinding?.dataStore
		?.recordsByCollectionId?.[COLLECTION];
	if (!records) {
		throw new Error(`newmarkets: the page holds no ${COLLECTION} collection`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of Object.values(records)) {
		const name = clean(record.companyTitle ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const page = record['link-portfolio-companies-companyTitle'] ?? '';
		const states = (record.company_status ?? [])
			.map(clean)
			.filter((state) => state && !DEFAULT_STATE.test(state));

		companies.push({
			name,
			category: [tag(record.location ?? ''), ...states].filter(Boolean).join(', '),
			url: clean(record.website ?? '') || (page ? `${BASE_URL}${page}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('newmarkets: no companies in the portfolio collection');
	}

	return companies;
}
