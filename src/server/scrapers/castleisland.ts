import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://castleisland.vc/portfolio/';
const MAX_PAGES = 30;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor, the list an elementor loop that jetsmartfilters
// pages through ten at a time: the pages are asked for the way the
// filters' own links ask for them (?jsf=epro-loop-builder&pagenum=2), up
// to the count the page gives. each company is its name, a line about it,
// a link to its site and, as classes, the categories the dropdown spells
// out ("Protocols", "Payments & Stablecoins"). a page of the list that
// will not come fails the run, rather than take a part of the list for
// the whole. nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\bdata-elementor-type="loop-item")/;
const CLASSES = /^<div\b[^>]*\bclass="([^"]*)"/;
const NAME = /<h1\b[^>]*>([\s\S]*?)<\/h1>/;
const SITE = /<a\b[^>]*\bclass="elementor-button\b[^"]*"[^>]*\bhref="([^"]*)"/;
const PAGES = /"max_num_pages":(\d+)/;
const OPTION = /<option\b[^>]*\bvalue="\d+"[^>]*>([\s\S]*?)<\/option>/g;
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

// "Payments & Stablecoins" -> "payments-stablecoins", as wordpress slugs it
const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/&/g, ' ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const first = await fetchText(PAGE_URL);
	const pages = Math.min(Number(first.match(PAGES)?.[1] ?? 1), MAX_PAGES);
	const labels = new Map([...first.matchAll(OPTION)].map(([, label]) => [slug(clean(label)), tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let page = 1; page <= pages; page++) {
		if (page > 1) await wait(PACE_MS);
		const html = page === 1 ? first : await fetchText(`${PAGE_URL}?jsf=epro-loop-builder&pagenum=${page}`);
		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const classes = item.match(CLASSES)?.[1] ?? '';
			const site = unescape(item.match(SITE)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [...classes.matchAll(/\bportfolio-category-([\w-]+)/g)]
					.map(([, category]) => labels.get(category) ?? '')
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('castleisland: no companies on the portfolio page');
	}

	return companies;
}
