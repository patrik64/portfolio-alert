import type { ScrapedCompany } from './types';

const BASE_URL = 'https://angelinvest.ventures';
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over prismic: the portfolio page is a grid of cards, a selection of
// the companies the fund has backed, each tagged for the page's filter by its
// fields ("AI,SaaS") and linking the company's page here. a card names its
// company only in its pictures' alt text, which is as often a caption ("cello
// founders") as a name, so the name is read from the company's page, a heading
// of its own, along with its site. a company the fund is out of is headed so
// ("Surfboard (acquired by Dialpad)"), and is kept by its name beside the
// buyer and the Exited tag. a card linking no page here (one linking the
// company's site, one a line of its description) is named by its logo's alt
// text instead, and left out when that is empty. every company page must load.

const CARD = /<div data-slice-type="company_grid_card"[\s\S]*?(?=<div data-slice-type="company_grid_card"|<\/section>)/g;
const TAGS = /\bdata-tags="([^"]*)"/;
const LINK = /<a\b[^>]*\baria-label="Learn more about a company"[^>]*\bhref="([^"]*)"/;
// the large card writes the name out; the others show only a logo
const WRITTEN = /<p class="text-h2[^"]*">([\s\S]*?)<\/p>/;
const LOGO = /<img alt="([^"]*)"[^>]*\bclass="[^"]*\bobject-contain\b/;
const OWN_PAGE = /^\/portfolio\/[^/?#]+\/?$/;
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1>/;
const SITE = /<a\b[^>]*\baria-label="Website"[^>]*\bhref="(https?:\/\/[^"]+)"/;
// "Surfboard (acquired by Dialpad)" -> "Surfboard", "Dialpad"
const ACQUIRED = /^(.+?)\s*\(\s*acquired by\s+([^)]+?)\s*\)$/i;
// a logo's alt text often carries the word: "Caery Care LOgo", "Paygentic logo-black (3)"
const LOGO_WORD = /[\s_-]*\blogo\b.*$/i;
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
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a company's page: the heading naming it and the link to its site
async function pageOf(path: string): Promise<{ heading: string; site: string }> {
	const html = await fetchText(new URL(path, BASE_URL).href);
	return {
		heading: clean(html.match(HEADING)?.[1] ?? ''),
		site: unescape(html.match(SITE)?.[1] ?? '').trim()
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const cards = [...html.matchAll(CARD)].map(([card]) => {
		const link = unescape(card.match(LINK)?.[1] ?? '').trim();
		return {
			tags: (card.match(TAGS)?.[1] ?? '').split(',').map(clean).filter(Boolean),
			link,
			own: OWN_PAGE.test(link),
			shown: clean(card.match(WRITTEN)?.[1] ?? '') || clean(card.match(LOGO)?.[1] ?? '').replace(LOGO_WORD, '')
		};
	});
	if (cards.length === 0) {
		throw new Error('angelinvest: no company cards on the portfolio page — the markup moved');
	}

	const pages = new Map<string, { heading: string; site: string }>();
	const paths = [...new Set(cards.filter((card) => card.own).map((card) => card.link))];
	for (let i = 0; i < paths.length; i += BATCH_SIZE) {
		const batch = paths.slice(i, i + BATCH_SIZE);
		const read = await Promise.all(batch.map(pageOf));
		batch.forEach((path, j) => pages.set(path, read[j]));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const page = card.own ? pages.get(card.link) : undefined;
		const heading = page?.heading || card.shown;
		const acquired = heading.match(ACQUIRED);
		const name = acquired?.[1] ?? heading;
		const buyer = acquired?.[2] ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...card.tags.map(tag), buyer ? `Acquired by ${tag(buyer)}` : '', buyer ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || (/^https?:\/\//i.test(card.link) ? card.link : card.own ? `${BASE_URL}${card.link}` : PAGE_URL)
		});
	}

	// a company page that stopped heading its company would leave the grid all but empty
	if (companies.length < cards.length * 0.8) {
		throw new Error(
			`angelinvest: only ${companies.length} of ${cards.length} cards were named — the company pages moved`
		);
	}

	return companies;
}
