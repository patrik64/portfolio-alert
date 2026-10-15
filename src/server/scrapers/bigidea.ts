import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://bigideaventures.com/portfolio/';
// the portfolio as the site's rest api gives it, a hundred a page, each
// company with the names of the terms it is filed under
const DATA_URL = 'https://bigideaventures.com/wp-json/wp/v2/portfolio?per_page=100&_embed=wp:term&page=';
const MAX_PAGES = 20;
const REFUSED_MS = 20_000;
// the site's server answers 403 to chrome user-agent strings and lets
// through a request that says plainly who is asking: so this one does
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress on divi: the portfolio page is a wall of logos, each linking
// the company's page on the fund's site, and the names are only there. the
// wall is drawn from the site's portfolio posts, which its rest api serves
// whole — a company each with its name, its page and the terms the wall's
// filters read: the fund it sits in ("Generation Food Rural Partners
// Fund"), its region and country, its category ("Plant-based") and its
// technology ("Materials Science"), kept as tags; "Others" as a category
// says nothing. nothing marks an exit.
//
// a company's page links its site among the icons under its piece, and
// nowhere else on the fund's site gives it. reading a hundred and twenty
// of those pages a night is what had siteground's firewall turn the fetch
// away, so they are not read: the api is, two requests, and every company
// links its page on the fund's site. every page of the api must load, and
// a list shorter than the total it reports fails the run.

// the terms, in the order the company's page lists them
const TAXONOMIES = ['funds_filter', 'region_filter', 'country_filter', 'category_filter', 'sector_filter'];
const STEALTH = /^stealth\b/i;

interface Term {
	taxonomy?: string;
	name?: string;
}

interface Entry {
	title?: { rendered?: string };
	link?: string;
	_embedded?: { 'wp:term'?: Term[][] };
}

// the api writes a curly apostrophe as its entity where the company's page
// wrote the character itself ("Angie’s Tempeh"), and the character is kept
const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page of the api; a refusal, or the captcha siteground's firewall puts
// under a 2xx status in front of an address it distrusts, vercel's among
// them some nights, is waited out once, and a page that still will not
// load fails the run, saying what answered
async function page(url: string): Promise<{ entries: Entry[]; total: number; pages: number }> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		const body = await resp.text();
		const captcha = /sgcaptcha/i.test(body);
		if ((resp.status === 429 || captcha) && attempt === 0) {
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok || captcha) {
			throw new Error(`bigidea: ${url} answered ${resp.status}${captcha ? ", siteground's captcha" : ''}`);
		}
		let entries: Entry[];
		try {
			entries = JSON.parse(body);
		} catch {
			throw new Error(`bigidea: ${url} answered with a page instead of json`);
		}
		return {
			entries: Array.isArray(entries) ? entries : [],
			total: Number(resp.headers.get('x-wp-total') ?? 0),
			pages: Number(resp.headers.get('x-wp-totalpages') ?? 1)
		};
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole list, a page at a time; a part of it must not pass for the whole
	const entries: Entry[] = [];
	let total = 0;
	for (let n = 1, pages = 1; n <= pages && n <= MAX_PAGES; n++) {
		const got = await page(`${DATA_URL}${n}`);
		entries.push(...got.entries);
		({ total, pages } = got);
	}
	if (total > 0 && entries.length < total) {
		throw new Error(`bigidea: the api gave ${entries.length} of the ${total} companies it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry?.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const terms = (entry._embedded?.['wp:term'] ?? []).flat();
		const link = clean(entry.link ?? '');
		companies.push({
			name,
			category: TAXONOMIES.flatMap((taxonomy) =>
				terms.filter((t) => t?.taxonomy === taxonomy).map((t) => tag(t.name ?? ''))
			)
				.filter((t, k, all) => t && !/^others?$/i.test(t) && all.indexOf(t) === k)
				.join(', '),
			url: /^https?:\/\//i.test(link) ? link : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bigidea: the api names no companies');
	}

	return companies;
}
