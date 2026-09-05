import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://partechpartners.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js of the older kind, which writes the whole page's data into one
// script tag. the portfolio is in there in full — no paging, no filtering to
// undo — with a name, a link, a sector and a status per company.
//
// "Current" is every company the fund still holds and says nothing; "Alumni"
// is how it words an exit, so that is kept, after the sector.
//
// the fund also records which of its funds came in and where the company is
// based. the fund is a vehicle rather than anything about the company, and the
// country would crowd out the sector, so neither is kept.

const DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
// the status of a company the fund still holds
const HELD = /^current$/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so the fund's "Industrial, Energy & IoT" would
// read as two sectors rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

interface Company {
	name?: string;
	external_link?: string;
	sectors?: { sector?: string }[];
	status?: { status?: string };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const blob = html.match(DATA)?.[1];
	if (!blob) {
		throw new Error('partech: the page carries no data to read the companies from');
	}

	let rows: Company[];
	try {
		rows = (JSON.parse(blob) as { props?: { pageProps?: { companies?: Company[] } } }).props
			?.pageProps?.companies ?? [];
	} catch {
		throw new Error('partech: the page data could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const status = clean(row.status?.status ?? '');
		companies.push({
			name,
			category: [
				...(row.sectors ?? []).map((s) => tag(s.sector ?? '')),
				HELD.test(status) ? '' : tag(status)
			]
				.filter(Boolean)
				.join(', '),
			url: clean(row.external_link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('partech: no companies in the page data');
	}

	return companies;
}
