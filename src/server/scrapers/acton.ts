import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.actoncapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists every company as a card linking its
// page here, carrying its name, its sector ("B2C", "SaaS") and its state,
// "Active" or "Exited"; a second list of the same cards gives each its
// country, by a slug the page's country headings spell out ("north-america"
// -> "North America"). a company's own page adds a table — the years it was
// founded and the fund first invested, its city and, on an exit, how it went
// ("Acquired by Cazoo in 2021", "NASDAQ IPO in 2015"), the buyer or the
// listing kept with the Exited tag — and a button to its site. the sector, the city, the country and the years are
// kept as tags. a company page that will not load leaves its company with
// what the list said, linking that page.

const CARD = /(?=<div role="listitem" class="companies-c-item w-dyn-item">)/;
const INFO = /(?=<div role="listitem" class="company-w-info w-dyn-item">)/;
const LINK = /<a\b[^>]*\bhref="(\/portfolio\/[^"]+)"[^>]*class="companies-list-link\b[^"]*"\s*>\s*<p>([\s\S]*?)<\/p>/;
const SECTOR = /<p class="display-none">([^<]*)<\/p>/;
const STATE = /fs-cmsfilter-field="state"[^>]*>([^<]*)</;
const COUNTRY_SLUG = /<p\b[^>]*\bclass="country hidden"[^>]*>([^<]*)</;
const COUNTRY_HEADING =
	/<div\s+country="([^"]+)"[^>]*class="group-country\b[^"]*"[^>]*>\s*<h3 class="companies-group-title">([^<]*)<\/h3>/g;
const ROW = /<div class="company-table-row(?! w-condition-invisible)[^"]*">\s*<p>([^<]*)<\/p>([\s\S]*?)(?=<div class="company-table-row|<\/div>\s*<a\b|$)/g;
const CITY = /class="text-right city">([^<]*)</;
const COUNTRY = /class="text-right country">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)" class="btn\b[^"]*">\s*Visit Company Website/;
const BUYER =
	/\b[Aa]cquired\b(?:\s+in\s+(?:\w+\s+)?\d{4})?\s+by\s+([\p{L}0-9][^.,;()]*?)(?=\s+(?:in|for|to|and|as|which|after)\b|[.,;()]|$)/u;
const IPO = /\bIPO\b/;
const EXITED = /^exited$/i;
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

const year = (s: string | undefined) => s?.match(/\b(?:19|20)\d{2}\b/)?.[0];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Page {
	site: string;
	founded?: string;
	invested?: string;
	exit: string;
	city: string;
	country: string;
}

// what a company's page says, or nothing when it will not load; a refusal
// is waited out once
async function pageOf(href: string): Promise<Page | null> {
	try {
		let resp = await fetch(`${BASE_URL}${href}`, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			resp = await fetch(`${BASE_URL}${href}`, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const facts = new Map<string, string>();
		for (const [, label, value] of html.matchAll(ROW)) {
			facts.set(clean(label).toLowerCase(), value);
		}
		const base = facts.get('base') ?? '';
		return {
			site: unescape(html.match(SITE)?.[1] ?? '').trim(),
			founded: year(clean(facts.get('founded') ?? '')),
			invested: year(clean(facts.get('initial investment') ?? '')),
			exit: clean(facts.get('exit') ?? ''),
			city: clean(base.match(CITY)?.[1] ?? ''),
			country: clean(base.match(COUNTRY)?.[1] ?? '')
		};
	} catch {
		return null;
	}
}

interface Card {
	name: string;
	href: string;
	sector: string;
	state: string;
	country: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the countries the headings spell out, by slug
	const countries = new Map<string, string>(
		[...html.matchAll(COUNTRY_HEADING)].map(([, slug, name]) => [slug, clean(name)])
	);
	// each company's country slug, by the page it links
	const countryOf = new Map<string, string>();
	for (const info of html.split(INFO).slice(1)) {
		const href = info.match(LINK)?.[1];
		const slug = clean(info.match(COUNTRY_SLUG)?.[1] ?? '');
		if (href && slug) countryOf.set(href, countries.get(slug) ?? '');
	}

	const cards: Card[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const [, href, written] = card.match(LINK) ?? [];
		const name = clean(written ?? '');
		if (!href || !name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		cards.push({
			name,
			href,
			sector: clean(card.match(SECTOR)?.[1] ?? ''),
			state: clean(card.match(STATE)?.[1] ?? ''),
			country: countryOf.get(href) ?? ''
		});
	}
	if (cards.length === 0) {
		throw new Error('acton: no company cards on the portfolio page — the markup moved');
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, card] of cards.entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = await pageOf(card.href);
		if (page?.site) withSite++;
		const out = EXITED.test(card.state) || !!page?.exit;
		const buyer = page?.exit.match(BUYER)?.[1]?.trim();
		companies.push({
			name: card.name,
			category: [
				tag(card.sector),
				page?.city ? tag(page.city) : '',
				tag(page?.country || card.country),
				page?.founded ? `Founded ${page.founded}` : '',
				page?.invested ? `Invested ${page.invested}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				IPO.test(page?.exit ?? '') ? 'IPO' : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || `${BASE_URL}${card.href}`
		});
	}
	// without the company pages every company would link the fund's site
	if (withSite === 0) {
		throw new Error("acton: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
