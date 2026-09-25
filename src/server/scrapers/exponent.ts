import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.exponentpe.com';
const PAGE_URL = `${BASE_URL}/our-portfolio`;
// the deal pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the portfolio is a wall of deal teasers, each a logo linking the
// deal's page here, with the company's name in the link's title and, in a
// data attribute, whether the investment is current or realised and the
// sector ("Realised Media"). the deal page adds the fund that made it, the
// month of the deal and, in the story, a link to the company's site — the
// one carrying the company's name where there is one, else the first there
// is, cut back to the site when it points deep into it. a private equity
// investment "realised" is one the fund is out of. a deal page that will not
// load leaves its company linking to that page.

const TEASER = /<a\b[^>]*\bhref="(\/[^"]+)"[^>]*\btitle="([^"]*)"[^>]*\bdata-category="([^"]*)"/g;
const STAT = /<div class="stat">\s*<h3>\s*([\s\S]*?)\s*<\/h3>\s*<p>\s*([\s\S]*?)\s*<\/p>/g;
const EXTERNAL = /<a\b[^>]*\bhref="(https?:\/\/(?!(?:www\.)?exponentpe\.com)[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// a link to the company's social page, or to a brochure hosted elsewhere
// (enva's is an indesign document on adobe's servers), is not its site
const NOT_A_SITE =
	/linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|indd\.adobe\.com|issuu\.com|vimeo\.com/i;
const STEALTH = /^stealth\b/i;

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const key = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, '');

interface Deal {
	site: string;
	fund: string;
	year: string;
	realised: boolean;
}

// what a deal's page says, or nothing when it will not load
async function dealOf(page: string, name: string): Promise<Deal | null> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return null;
		const html = await resp.text();

		let fund = '';
		let year = '';
		let realised = false;
		for (const [, figure, caption] of html.matchAll(STAT)) {
			const what = clean(caption);
			if (/^deal size/i.test(what)) year = what.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '';
			if (/investment$/i.test(what)) {
				fund = clean(figure);
				realised = /realised|realized|exited/i.test(what);
			}
		}

		const links = [...html.matchAll(EXTERNAL)]
			.map(([, href, text]) => ({ href: unescape(href), text: clean(text) }))
			.filter((l) => !NOT_A_SITE.test(l.href));
		const named = links.find((l) => key(l.text) === key(name));
		let site = named?.href ?? '';
		if (!site && links[0]) {
			try {
				site = new URL(links[0].href).origin + '/';
			} catch {
				site = links[0].href;
			}
		}
		return { site, fund, year, realised };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const listed: { name: string; page: string; sector: string; realised: boolean }[] = [];
	const seen = new Set<string>();
	for (const [, path, title, category] of html.matchAll(TEASER)) {
		const name = clean(title);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "Realised Media" -> the status, then the sector
		const [status, ...rest] = clean(category).split(/\s+/);
		listed.push({
			name,
			page: `${BASE_URL}${unescape(path)}`,
			sector: tag(rest.join(' ')),
			realised: /^realised|realized|exited$/i.test(status ?? '')
		});
	}
	if (listed.length === 0) {
		throw new Error('exponent: no deals on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (const [i, c] of listed.entries()) {
		if (i > 0) await wait(PACE_MS);
		const deal = await dealOf(c.page, c.name);
		const realised = c.realised || Boolean(deal?.realised);
		companies.push({
			name: c.name,
			category: [c.sector, deal?.fund ?? '', deal?.year ? `Invested ${deal.year}` : '', realised ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: deal?.site || c.page
		});
	}

	return companies;
}
