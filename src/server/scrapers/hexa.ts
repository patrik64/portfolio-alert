import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.hexa.com';
const PAGE_URL = `${BASE_URL}/companies`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: hexa is a startup studio, and its companies page is a grid of
// cards, the whole of it in the page, a card a company linking its page
// here, with the year it came to hexa (the batch it joined, "HX17"), a
// line about it and, for the page's filters, its categories ("BtoB",
// "Future of Work"), its track ("Start", "Sprint", "Scale") and its status
// ("Active", "Acquired", "Inactive"). the card's logo has no alt text, so
// the company's name is read from its page, which also gives its site.
// the categories, the track and the year are kept as tags, a sale with the
// Acquired tag and a company no longer running with the Closed tag.
//
// a company without its page has no name to list it by, so a company page
// that will not load, or is not reached by the deadline, fails the run
// rather than leave the company out.

const CARD = /(?=<div cms-item="" role="listitem" class="our-companies_item w-dyn-item">)/;
const PAGE = /<a aria-label="our-companies-link" href="([^"]*)"/;
const YEAR = /class="our-companies_tag">\s*((?:19|20)\d{2})/;
const FIELD = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([^<]*)<`, 'g');
const NAME = /<h2 class="heading-style-h1">([\s\S]*?)<\/h2>/;
const TITLE = /<title>\s*Hexa\s*-\s*([^<]*)<\/title>/;
const SITE = /class="page-destination-template_tag">WEBSITE<\/div>\s*<a href="([^"]*)"/;
const ACQUIRED = /^acquired$/i;
const INACTIVE = /^inactive$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
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

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// a company page's name and site; a page that will not give its name fails the run
async function detailsOf(href: string): Promise<{ name: string; site: string }> {
	const resp = await get(href);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${href}: ${resp.status}`);
	}
	const html = await resp.text();
	const name = clean(html.match(NAME)?.[1] ?? '') || clean(html.match(TITLE)?.[1] ?? '');
	if (!name) {
		throw new Error(`hexa: ${href} names no company — the company pages' markup moved`);
	}
	const site = unescape(html.match(SITE)?.[1] ?? '').trim();
	return { name, site: /^https?:\/\//i.test(site) ? site : '' };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const path = card.match(PAGE)?.[1];
		if (!path) continue;
		const href = new URL(unescape(path), BASE_URL).href;
		if (Date.now() - started >= DEADLINE_MS) {
			throw new Error('hexa: the company pages ran past the deadline — the portfolio would be partial');
		}
		if (companies.length > 0) await wait(PACE_MS);
		const { name, site } = await detailsOf(href);
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fields = (field: string) => [...card.matchAll(FIELD(field))].map(([, value]) => clean(value));
		const status = fields('status')[0] ?? '';
		const year = card.match(YEAR)?.[1];
		companies.push({
			name,
			category: [
				...fields('category').map(tag),
				...fields('track').map(tag),
				year ? `Invested ${year}` : '',
				ACQUIRED.test(status) ? 'Acquired' : INACTIVE.test(status) ? 'Closed' : tag(status)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('hexa: no companies on the companies page — the markup moved');
	}

	return companies;
}
