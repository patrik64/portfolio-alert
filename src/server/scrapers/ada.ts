import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.adaventures.com';
const PAGE_URL = `${BASE_URL}/`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the home page's portfolio is a wall of logos, each linking the
// company's page on the fund's site and carrying its site and, hidden for
// the filter, its focus area ("Climate Equity"), the fund ("Fund II") and
// the stage the fund came in at ("Pre-seed"), all kept as tags. no logo is
// named, so each company's page is fetched, one at a time, for the name it
// heads with; a page that will not load fails the run, as the name is
// nowhere else. nothing marks an exit.

const ITEM = /<a\b([^>]*\bclass="company-logo-link\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const DATA_LINK = /\bdata-link="([^"]*)"/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1>/g;
const BACK = /^back to portfolio$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the name a company's page heads with; a refusal is waited out once, and a
// page that will not load, or names nobody, fails the run
async function nameOf(page: string): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) {
			throw new Error(`ada: ${page} answered ${resp.status}`);
		}
		const html = await resp.text();
		const name = [...html.matchAll(HEADING)].map(([, heading]) => clean(heading)).find((h) => h && !BACK.test(h));
		if (!name) {
			throw new Error(`ada: ${page} names no company`);
		}
		return name;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const pages = new Set<string>();
	for (const [, attributes, body] of html.matchAll(ITEM)) {
		const href = unescape(attributes.match(HREF)?.[1] ?? '').trim();
		if (!href) continue;
		const page = new URL(href, BASE_URL).href;
		if (pages.has(page)) continue;
		pages.add(page);
		await wait(PACE_MS);
		const name = await nameOf(page);
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(attributes.match(DATA_LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: ['Focus area', 'Fund', 'Stage']
				.map((field) => tag(body.match(FIELD(field))?.[1] ?? ''))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : page
		});
	}
	if (companies.length === 0) {
		throw new Error('ada: no companies on the home page');
	}

	return companies;
}
