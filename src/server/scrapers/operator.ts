import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.operatorpartners.com';
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const QUERY_URL = `${BASE_URL}/_api/cloud-data/v1/wix-data/collections/query`;
const COLLECTION = 'PORTFOLIO';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix. the portfolio page serves an empty table and the fund's collection
// behind it is asked for in the browser, so the html holds the column headings
// and nothing else. the collection is asked for here the same way the page
// asks: the site hands out a token for its own data at a public address, and
// that token opens the collection.
//
// which token is not written down here. the site issues one per app it runs
// and names them by id; the one for its own data is the one it writes as
// wixcode-pub, so it is picked out by that rather than by an id kept in this
// repository, which would be one more thing to go stale.
//
// the fund keeps two names for a company: a plain one it sorts on and a
// written one it draws in the table. the plain one carries the typos — Modern
// LIfe, Hasboard — so the written one is the name here, less what it says in
// brackets after it.
//
// which brings the state with it. the fund marks a company acquired or
// inactive in three places — those brackets, a status field, and a label for
// the narrow layout — and they disagree: nine companies the brackets call
// acquired or inactive are still Active in the field. nothing is marked in the
// other two that the brackets do not mark, so the brackets are read and the
// other two are left alone. acquired is written as the exit it is.

// the token the site issues for its own data, written as its own kind
const OWN_DATA = /^wixcode-pub\./;
// what the fund writes in brackets after a company's name
const STATE = /\s*\(([^)]*)\)\s*$/;

interface Tokens {
	apps?: Record<string, { instance?: string }>;
}

interface Item {
	title?: string;
	title1?: string;
	link?: string;
	sector?: string;
	round?: string;
}

interface Result {
	items?: Item[];
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

// the written name comes back as the rich text the table draws
const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a company the fund has been acquired out of is an exit; one it writes off it
// leaves in its own word
const state = (bracketed: string) =>
	/^acquired$/i.test(bracketed) ? 'Exited' : tag(bracketed);

export async function scrape(): Promise<ScrapedCompany[]> {
	const tokens = await fetch(TOKENS_URL, { headers: { 'User-Agent': UA } });
	if (!tokens.ok) {
		throw new Error(`Failed to fetch ${TOKENS_URL}: ${tokens.status}`);
	}

	let issued: Tokens;
	try {
		issued = (await tokens.json()) as Tokens;
	} catch {
		throw new Error('operator: the site no longer says how to ask for its data');
	}

	const own = Object.entries(issued.apps ?? {}).find(([, app]) =>
		OWN_DATA.test(app.instance ?? '')
	);
	if (!own) {
		throw new Error('operator: the site no longer says how to ask for its data');
	}
	const [appId, { instance }] = own;

	const resp = await fetch(QUERY_URL, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/json',
			Authorization: instance as string
		},
		body: JSON.stringify({
			collectionName: COLLECTION,
			dataQuery: { paging: { offset: 0, limit: 1000 } },
			segment: 'LIVE',
			appId
		})
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch the ${COLLECTION} collection: ${resp.status}`);
	}

	let result: Result;
	try {
		result = (await resp.json()) as Result;
	} catch {
		throw new Error('operator: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of result.items ?? []) {
		const drawn = clean(item.title1 ?? '') || clean(item.title ?? '');
		const bracketed = drawn.match(STATE)?.[1] ?? '';
		const name = clean(drawn.replace(STATE, ''));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [tag(item.sector ?? ''), tag(item.round ?? ''), state(bracketed)]
				.filter(Boolean)
				.join(', '),
			url: clean(item.link ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('operator: no companies in the portfolio');
	}

	return companies;
}
