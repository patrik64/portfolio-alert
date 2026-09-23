import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.goldengate.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the portfolio page is one collection list of cards, newest first,
// each naming the company over the countries and industries the fund files
// it under, with a badge for one listed ("IPO"), sold ("exit") or shut
// ("closed"), and a link to the company's page here — the only place its
// own site is given, as a link written out ("kita.ai"), so those pages are
// fetched in batches; one that will not load leaves its company linking to
// that page. webflow shows a list a hundred items at most, and the list has
// no pages of its own, so the oldest companies fall off its end; the
// sitemap still names their pages, which are read for the rest. a closed
// company folded rather than exited, so it is kept only as the word.

const CARD = /(?=<div role="listitem" class="portfolio-card\b)/;
const OWN_PAGE = /href="(\/portfolio\/[^"#?]+)"/;
const CARD_NAME = /<h3 class="heading">([\s\S]*?)<\/h3>/;
const PAGE_NAME = /<h3\b[^>]*class="title"[^>]*>([\s\S]*?)<\/h3>/;
const COUNTRIES = /class="countries w-dyn-list"[\s\S]*?<\/div><\/div><\/div>/;
const COUNTRY = /<div role="listitem" class="w-dyn-item"><div>([\s\S]*?)<\/div><\/div>/g;
const INDUSTRY = /class="industry">([\s\S]*?)<\/div>/;
// a badge shows unless webflow's conditional visibility hides it
const BADGE = /class="portfolio-card-(ipo|exit|closed)[\w-]*"/g;
const SOCIAL =
	/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bsocial-media-icon\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
// the address, written out as the text of its own link
const WRITTEN_OUT = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
const PAGE_IN_SITEMAP = /<loc>https?:\/\/(?:www\.)?goldengate\.vc(\/portfolio\/[^<#?]+)<\/loc>/g;
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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// "Gojek" -> ["IPO", "Exited"]; a closed company only says so
function badges(html: string): string[] {
	const shown = new Set([...html.matchAll(BADGE)].map((m) => m[1]));
	if (shown.has('ipo')) return ['IPO', 'Exited'];
	if (shown.has('exit')) return ['Exited'];
	if (shown.has('closed')) return ['Closed'];
	return [];
}

function siteOf(page: string): string {
	for (const [, href, text] of page.matchAll(SOCIAL)) {
		if (WRITTEN_OUT.test(clean(text))) return unescape(href);
	}
	return '';
}

interface Listed {
	path: string;
	name: string;
	category: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, sitemap] = await Promise.all([
		fetchText(PAGE_URL),
		// without the sitemap only the oldest companies go unread
		fetchText(SITEMAP_URL).catch(() => '')
	]);

	const listed = new Map<string, Listed>();
	for (const card of html.split(CARD).slice(1)) {
		const path = card.match(OWN_PAGE)?.[1];
		const name = clean(card.match(CARD_NAME)?.[1] ?? '');
		if (!path || !name || listed.has(path)) continue;
		const countries = [...(card.match(COUNTRIES)?.[0] ?? '').matchAll(COUNTRY)].map((m) => tag(m[1]));
		const industries = clean(card.match(INDUSTRY)?.[1] ?? '').split(/\s*,\s*/);
		listed.set(path, { path, name, category: [...industries, ...countries, ...badges(card)] });
	}
	if (listed.size === 0) {
		throw new Error('goldengate: no companies on the portfolio page');
	}
	// the companies past the list's hundred, known only by their pages
	const unlisted = [...new Set([...sitemap.matchAll(PAGE_IN_SITEMAP)].map((m) => m[1]))].filter(
		(path) => !listed.has(path)
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string[], url: string) => {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: category.filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
			url
		});
	};

	const paths = [...listed.keys(), ...unlisted];
	for (let i = 0; i < paths.length; i += BATCH_SIZE) {
		const batch = paths.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(batch.map((path) => fetchText(`${BASE_URL}${path}`).catch(() => '')));
		batch.forEach((path, j) => {
			const known = listed.get(path);
			const own = `${BASE_URL}${path}`;
			if (known) {
				add(known.name, known.category, siteOf(pages[j]) || own);
				return;
			}
			// a company off the list's end is named by its page, or not at all
			add(clean(pages[j].match(PAGE_NAME)?.[1] ?? ''), badges(pages[j]), siteOf(pages[j]) || own);
		});
	}

	return companies;
}
