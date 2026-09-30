import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ciscoinvestments.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the table the portfolio is kept in, on the portal the site runs on, as
// hubspot's api serves a table its owner has opened to the public — asked
// for the two columns read here and no more
const ROWS_URL =
	'https://api.hubapi.com/cms/v3/hubdb/tables/2321711855/rows?portalId=4023447&limit=1000&properties=website,description';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hubspot, the portfolio a hubdb table: the page holds a card for every row
// the table marks active — a logo whose alt text names the company, "Arcade
// logo", a badge "Active" or "Exit", and in data attributes its sectors and
// regions as slugs, which the filters above the cards spell out, and
// whether it is a direct investment or a vc fund. the funds are cisco's
// stakes in other funds, not companies, and are left out. the filters run
// in the browser and the cards come in twenty-four at a time only for show:
// the page holds them all.
//
// a card links the company's page on the site, which is where its own
// address is; but the table is open to the public through hubspot's api,
// which hands every row's address and description in one request, so that
// is asked rather than two hundred and fifty pages. the table also holds
// rows the page does not show — one marked a preview, as this is written —
// so the page alone says who is in the portfolio, and the table only adds
// to the cards found there; should the table be closed, the companies link
// to their pages here. a third of the exits' descriptions say how it went,
// "Lightwire was acquired by Cisco in 2012" or "Cisco acquired Duo in
// 2018", and the buyer is kept.

const CARD = /(?=<div class="portfolio-card"\s)/;
const PAGE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio-card-link"/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"/;
// a choice of a filter: the slug the cards carry, and how it is spelled out
const CHOICE = /<div data-value="([^"]+)">([^<]*)<\/div>/g;
const BOUGHT_BY =
	/\b[Aa]cquired by\s+((?:the\s+)?[A-Z0-9][^.,;()]*?)(?=\s+(?:in|on)\s+(?:[A-Z][a-z]+\.?\s+)?(?:\d{1,2},?\s+)?(?:19|20)\d{2}\b|\s*[.,;()]|\s*$)/;
const BOUGHT =
	/(?:^|[.!?\]]\s*)(?:On [A-Z][a-z]+ \d{1,2}, \d{4},\s+)?([A-Z][\w&'-]*(?: [A-Z][\w&'-]*)*) acquired ([^.,;()]+?)(?=\s+in\s+(?:[A-Z][a-z]+\s+)?(?:19|20)\d{2}\b|\s*[.,;()]|\s*$)/g;
const STEALTH = /^stealth\b/i;

interface Row {
	path?: string;
	values?: { website?: string; description?: string };
}

interface Rows {
	results?: Row[];
	paging?: { next?: { after?: string } };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// an address as the table holds it, typed by hand: "https:// sgnl.ai/" and
// "near.co/https://" are both in there and are mended, and so is
// "https://company/4paradigm/", whose host is no host and which is dropped
const site = (raw: string) => {
	const typed = raw.replace(/\s+/g, '');
	const bare = typed.replace(/https?:\/\//gi, '');
	const address = /^https?:\/\/[^/]/i.test(typed) ? typed : bare && `https://${bare}`;
	return /^https?:\/\/[^/?#]*\.[^/?#]/i.test(address) ? address : '';
};

// a name down to its letters and digits, to tell "Open DNS" is OpenDNS
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// who bought a company, where its description says so: outright, or as the
// buyer's own deed, which counts when what was bought is the company and
// the buyer is someone else — a company's own purchases are not its exit
function buyerOf(name: string, told: string): string {
	const outright = told.match(BOUGHT_BY)?.[1];
	if (outright) return outright;
	const alike = (a: string, b: string) => a.length > 2 && (a.startsWith(b) || b.startsWith(a));
	for (const [, buyer, bought] of told.matchAll(BOUGHT)) {
		if (alike(letters(bought), letters(name)) && !alike(letters(buyer), letters(name))) return buyer;
	}
	return '';
}

// the table's rows by the last part of their pages' addresses, or none when
// the table will not be read
async function rowsOf(): Promise<Map<string, Row>> {
	const rows = new Map<string, Row>();
	try {
		for (let after = '', asked = 0; asked < 10; asked++) {
			const resp = await fetch(`${ROWS_URL}${after ? `&after=${after}` : ''}`, {
				headers: { 'User-Agent': UA, Accept: 'application/json' }
			});
			if (!resp.ok) break;
			const answer = (await resp.json()) as Rows;
			for (const row of answer.results ?? []) {
				if (row.path) rows.set(row.path, row);
			}
			after = answer.paging?.next?.after ?? '';
			if (!after) break;
		}
	} catch {
		// the table is closed: the cards stand on their own
	}
	return rows;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cards = html.split(CARD).slice(1);
	if (cards.length === 0) {
		throw new Error('cisco: no companies on the portfolio page');
	}
	const labels = new Map([...html.matchAll(CHOICE)].map(([, slug, label]) => [slug, tag(label)]));
	// a slug the filters do not spell out is read as it stands
	const spelled = (slugs: string) =>
		slugs
			.split(',')
			.map((slug) => slug.trim())
			.filter(Boolean)
			.map((slug) => labels.get(slug) ?? slug.replace(/_/g, ' '));
	const rows = await rowsOf();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const opening = card.slice(0, card.indexOf('>') + 1);
		const attr = (name: string) => unescape(opening.match(new RegExp(`\\bdata-${name}="([^"]*)"`))?.[1] ?? '');
		if (attr('investment_type') === 'vc_fund') continue;
		const name = clean(card.match(LOGO)?.[1] ?? '').replace(/\s+logo$/i, '') || clean(attr('name'));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = unescape(card.match(PAGE)?.[1] ?? '').trim();
		const row = rows.get(path.replace(/\/+$/, '').split('/').pop() ?? '');
		const exited = attr('investment_status') === 'exit';
		const buyer = exited ? tag(buyerOf(name, clean(row?.values?.description ?? ''))) : '';
		companies.push({
			name,
			category: [
				...spelled(attr('sectors')),
				...spelled(attr('regions')),
				buyer ? `Acquired by ${buyer}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site(row?.values?.website ?? '') || (path ? new URL(path, PAGE_URL).href : PAGE_URL)
		});
	}

	return companies;
}
