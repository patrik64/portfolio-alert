import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.blackhornvc.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a list served whole, a row a company —
// its name, an "Exited" tag hidden on the ones the fund still holds, a
// line about it, the industry ("Energy & Grid") and the fund vintage
// ("Seed", "IIF 2") the filters read — each linking the company's page on
// the fund's site, where its own site is the one button, written as a
// bare host ("agerpoint.com"). those pages are fetched one at a time, and
// a page that will not load leaves its company linking to it.

const ROW = /(?=<div\b[^>]*\bclass="company-row")/;
const NAME = /class="txt-32px-bold"[^>]*>([\s\S]*?)<\/div>/;
const EXITED = /class="exited-tag"/;
const INDUSTRY = /fs-cmsfilter-field="industry"[^>]*>([\s\S]*?)<\/div>/;
const VINTAGE = /fs-cmsfilter-field="vintage"[^>]*>([\s\S]*?)<\/div>/g;
const PAGE = /<a\b[^>]*\bhref="(\/companies\/[^"]+)"/;
// the page's one button, in its holder; the nav's contact button wears the same class
const SITE = /class="btn-holder"[^>]*>\s*<a\b[^>]*\bhref="([^"#]+)"/;
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

// the company's site, from its page on the fund's site, or nothing when
// the page will not load; a refusal is waited out once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
			if (!site) return '';
			// the button is written as a bare host more often than an address
			return /^https?:\/\//i.test(site) ? site : /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(site) ? `https://${site}` : '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = unescape(row.match(PAGE)?.[1] ?? '').trim();
		const page = path ? `${BASE_URL}${path}` : '';
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({
			name,
			category: [
				tag(row.match(INDUSTRY)?.[1] ?? ''),
				...[...row.matchAll(VINTAGE)].map(([, v]) => tag(v)),
				EXITED.test(row) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || page || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('blackhorn: no companies on the portfolio page');
	}

	return companies;
}
