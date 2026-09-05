import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nfx.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over wordpress. the page draws a table of two hundred and thirty-six
// companies and ships every one of them in the props next hands its own app,
// so the props are read rather than the table. the page counts itself in that
// same object, and the count agrees with the list.
//
// the fund keeps a second list beside the first, of the twenty-six it calls
// unicorns. they are all in the first as well, so the second is read only for
// which of them it names, and that becomes a tag.
//
// what a company is filed under is its focus areas, the round the fund first
// came in at, and whether it still holds it. Active is what a company is while
// it is neither acquired nor public, so it is dropped and only the other two
// are kept.
//
// the round is the fund's own text and is not always a round — most say Seed
// or Series A, a few say GP Angel Investment, one says a year and one names
// the company it was acquired out of. those are what the fund writes in that
// column and are left as written.
//
// the fund has the same company twice over, as Praso and as PRASO, on one
// address and with two different rounds. the first is kept, the way a repeated
// name is anywhere else.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
// what a company is while the fund still holds it
const HELD = /^active$/i;

interface Company {
	id?: number;
	title?: { rendered?: string };
	acf?: { link?: string; first_partnered?: string; status?: string };
	focusAreas?: { name?: string }[];
}

interface Next {
	props?: { pageProps?: { companies?: Company[]; unicornCompanies?: Company[] } };
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a focus area written with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const literal = html.match(NEXT_DATA)?.[1];
	if (!literal) {
		throw new Error('nfx: the page no longer ships its companies beside it');
	}

	let next: Next;
	try {
		next = JSON.parse(literal) as Next;
	} catch {
		throw new Error('nfx: the companies came back in a shape that could not be read');
	}

	const page = next.props?.pageProps;
	const unicorns = new Set((page?.unicornCompanies ?? []).map((c) => c.id));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of page?.companies ?? []) {
		const name = clean(entry.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const status = tag(entry.acf?.status ?? '');
		companies.push({
			name,
			category: [
				...(entry.focusAreas ?? []).map((area) => tag(area.name ?? '')),
				tag(entry.acf?.first_partnered ?? ''),
				HELD.test(status) ? '' : status,
				unicorns.has(entry.id) ? 'Unicorn' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: clean(entry.acf?.link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('nfx: no companies in the page’s props');
	}

	return companies;
}
