import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.hearstlab.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the portfolio page holds two lists of cards — the companies held,
// each with the city it works from and a link to the company's page here, and
// the companies acquired, each marked "Acquired" where the city would be and
// linking nowhere. the companies' pages write the address out as a link whose
// text is the address; they are fetched in batches for it, and a page that
// will not load leaves its company linking to that page. a name can carry a
// note of an older one — "TopicLake (formerly Conveyer)" — which is not part
// of it.

const CARD = /<a href="([^"]*)"[^>]*class="[^"]*\bcard\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const OWN_PAGE = /^\/portfolio-companies-v2\/[^/?#]+$/;
const NAME = /<h4[^>]*>([\s\S]*?)<\/h4>/;
const DETAIL = /class="text-100\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const ANCHOR = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// the address, written out as the text of its own link
const WRITTEN_OUT = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
const FORMERLY = /\s*\((?:formerly|fka|f\.k\.a\.)\s[^)]*\)\s*/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "New York City, NY" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function siteOf(page: string): Promise<string> {
	try {
		const resp = await fetch(`${BASE_URL}${page}`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return '';
		const html = await resp.text();
		const own = [...html.matchAll(ANCHOR)].find((m) => WRITTEN_OUT.test(clean(m[2])));
		return own ? unescape(own[1]) : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const listed: { name: string; page: string; detail: string }[] = [];
	const seen = new Set<string>();
	for (const [, href, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '').replace(FORMERLY, ' ').trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		listed.push({
			name,
			page: OWN_PAGE.test(href) ? href : '',
			detail: clean(card.match(DETAIL)?.[1] ?? '')
		});
	}
	if (listed.length === 0) {
		throw new Error('hearstlab: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((c) => (c.page ? siteOf(c.page) : Promise.resolve(''))));
		batch.forEach((c, j) => {
			const acquired = /^acquired$/i.test(c.detail);
			companies.push({
				name: c.name,
				category: acquired ? 'Acquired, Exited' : tag(c.detail),
				url: sites[j] || (c.page ? `${BASE_URL}${c.page}` : '')
			});
		});
	}

	return companies;
}
