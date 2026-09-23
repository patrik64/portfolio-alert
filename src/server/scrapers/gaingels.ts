import type { ScrapedCompany } from './types';

const BASE_URL = 'https://gaingels.com';
const REFRESH_URL = `${BASE_URL}/wp-json/facetwp/v1/refresh`;
const TEMPLATE = 'portfolio_companies';
const PER_PAGE = 500;
const MAX_PAGES = 30;
// the share of facetwp's count the pages must add up to
const MIN_SHARE = 0.95;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor. the portfolio on the home page is a facetwp
// template, twenty-four companies at a time behind "See More"; facetwp's own
// refresh endpoint answers for any page, and at five hundred to a page it
// takes a handful of requests for the lot. every row carries the company as
// json — its name, sectors, the rounds the fund came in at, its site and how
// it ended, if it has: "Acquired", "IPO", "SPAC" or a "Share Buyback" are
// exits, while "Wind Down" is a company that folded and is kept only as the
// word. the page adds to the list a few companies "not synced" to the
// template, written into the home page itself, and those are read too. a
// name can carry a note of an older one — "Ro (fka. Roman)" — which is not
// part of it. the rest api's company type holds twice as many posts as the
// page shows, so it is not the list.

const ROW = /data-company='([^']*)'/g;
const NOT_SYNCED = /window\.companiesData_not_synced\s*=\s*(\[[\s\S]*?\]);\s*\n/;
const FORMERLY = /\s*\((?:formerly|fka|f\.k\.a)\.?\s[^)]*\)\s*/i;
const EXITS = /^(acquired|acquisition|ipo|spac|share buyback|merged)$/i;
const ROUND = /^(pre-seed|seed\+?|series [a-z]\+?)$/i;
// an ending filed among the rounds ("Series D,Exit") says again what the ending says
const ENDED = /^(exit|ipo|spac)$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	title?: string;
	sector?: string;
	round?: string;
	company_exit_type?: string | string[];
	website?: string;
}

interface Refresh {
	template?: string;
	settings?: { pager?: { total_rows?: number; total_pages?: number } };
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

// a list arrives as json ('["Seed","Seed+"]'), as commas ("Seed,Seed+") or as
// an array already
function list(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(list);
	const text = String(value ?? '').trim();
	if (text.startsWith('[')) {
		try {
			return list(JSON.parse(text));
		} catch {
			// fall through to the commas
		}
	}
	return text
		.split(',')
		.map((part) => clean(part.replace(/^["[\s]+|["\]\s]+$/g, '')))
		.filter(Boolean);
}

async function page(n: number): Promise<Refresh> {
	const resp = await fetch(REFRESH_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'facetwp_refresh',
			data: {
				facets: {},
				frozen_facets: {},
				http_params: { get: [], uri: '', url_vars: [] },
				template: TEMPLATE,
				extras: { sort: 'default', per_page: PER_PAGE },
				soft_refresh: 0,
				is_bfcache: 0,
				first_load: 0,
				paged: n
			}
		})
	});
	if (!resp.ok) {
		throw new Error(`gaingels: facetwp answered ${resp.status} for page ${n}`);
	}
	return (await resp.json()) as Refresh;
}

// the companies the page adds from outside the template
async function notSynced(): Promise<Company[]> {
	try {
		const resp = await fetch(`${BASE_URL}/`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return [];
		const json = (await resp.text()).match(NOT_SYNCED)?.[1];
		return json ? (JSON.parse(json) as Company[]) : [];
	} catch {
		return [];
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const rows: Company[] = [];
	let total = 0;
	for (let n = 1; n <= MAX_PAGES; n++) {
		const answer = await page(n);
		total = answer.settings?.pager?.total_rows ?? total;
		for (const [, json] of (answer.template ?? '').matchAll(ROW)) {
			try {
				rows.push(JSON.parse(unescape(json)) as Company);
			} catch {
				// a row that is not json is passed over; the count below catches many
			}
		}
		if (n >= (answer.settings?.pager?.total_pages ?? 1)) break;
	}
	if (total > 0 && rows.length < total * MIN_SHARE) {
		throw new Error(`gaingels: facetwp gave ${rows.length} of the ${total} companies it counts`);
	}
	rows.push(...(await notSynced()));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.title ?? '')
			.replace(FORMERLY, ' ')
			.trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// a round filed as the ending by mistake is no ending
		const ending = list(row.company_exit_type).filter((e) => !ROUND.test(e));
		const exited = ending.some((e) => EXITS.test(e));
		companies.push({
			name,
			category: [
				...list(row.sector).map(tag),
				...list(row.round)
					.filter((r) => !ENDED.test(r))
					.map(tag),
				...ending.map(tag),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(row.website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('gaingels: facetwp lists no companies');
	}

	return companies;
}
