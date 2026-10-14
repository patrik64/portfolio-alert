import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.silicongardens.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a section a fund ("Fund III portfolio",
// "Fund II portfolio", "Fund I portfolio"), each a set of tabs whose first,
// "All", holds the fund's whole list and the others its categories again.
// a card is a company linking its site, with its name, its category ("B2B
// SAAS", "CONSUMER APP"), a line about it and an "EXIT" badge the page
// shows only on one the fund is out of. a card the fund keeps undisclosed is
// left out, and a company in more than one fund is listed once with each
// fund. the fund and the category are kept as tags, an exit with the
// Exited tag.

const SECTION = /(?=<section\b[^>]*\bid="fund-\d+")/;
const HEADING = /<h2\b[^>]*>\s*(Fund [IVX]+)\s+portfolio\s*<\/h2>/i;
// the first tab of a fund's set, "All"
const PANES = /(?=<div data-w-tab="[^"]*" class="tab-pane\b)/;
const CARD = /(?=<div role="listitem" class="portfolio-collection-item w-dyn-item">)/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="portfolio-card\b/;
const NAME = /<h3 class="heading-style-h5">([\s\S]*?)<\/h3>/;
const CATEGORY = /class="portfolio-category-text">([^<]*)</;
const EXIT = /<div class="exit-wrap">/;
const UNDISCLOSED = /^undisclosed\b/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

interface Entry {
	name: string;
	url: string;
	tags: string[];
	exited: boolean;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const sections = html.split(SECTION).slice(1);
	if (sections.length === 0) {
		throw new Error("silicongardens: the portfolio page's fund sections moved");
	}

	const entries = new Map<string, Entry>();
	for (const section of sections) {
		const fund = clean(section.match(HEADING)?.[1] ?? '');
		const [, all = ''] = section.split(PANES);
		for (const card of all.split(CARD).slice(1)) {
			const name = clean(card.match(NAME)?.[1] ?? '');
			if (!name || UNDISCLOSED.test(name) || STEALTH.test(name)) continue;
			const site = unescape(card.match(SITE)?.[1] ?? '').trim();
			const key = name.toLowerCase();
			const entry: Entry = entries.get(key) ?? {
				name,
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL,
				tags: [],
				exited: false
			};
			entry.tags.push(fund, tag(card.match(CATEGORY)?.[1] ?? ''));
			entry.exited ||= EXIT.test(card);
			entries.set(key, entry);
		}
	}

	const companies: ScrapedCompany[] = [...entries.values()].map(({ name, url, tags, exited }) => ({
		name,
		category: [...tags, exited ? 'Exited' : '']
			.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
			.join(', '),
		url
	}));

	if (companies.length === 0) {
		throw new Error('silicongardens: no companies in the funds\' lists — the markup moved');
	}
	if (companies.every(({ url }) => url === PAGE_URL)) {
		throw new Error("silicongardens: no company links its site — the cards' markup moved");
	}

	return companies;
}
