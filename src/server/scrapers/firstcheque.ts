import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.firstcheque.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a run of sections, one a sector ("B2B
// Marketplace", "FinTech"), each a collection list of the companies filed
// there — the logo linking the company's site under its name and a row of
// tags, of which webflow shows only the ones that apply: the fund it came
// from ("Fund 2"), "Acquired" or "Exited" for one the fund is out of, and
// "Closed" for one that folded, which is kept only as the word. the page
// carries a second table of contents naming sectors with no section, left
// from an older list, which is not read.

const SECTION = /(?=<div[^>]*class="[^"]*\bportfolio-sectors\b)/;
const HEADING = /<h\d[^>]*class="[^"]*\bheading-4\b[^"]*"[^>]*>([\s\S]*?)<\/h\d>/;
const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio-item\b)/;
const NAME = /class="portfolio-name"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="[^"]*\bportfolio-link\b/;
const TAG = /<div[^>]*class="(tag\b[^"]*)"[^>]*>\s*<div[^>]*class="tag-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
const HIDDEN = /\bw-condition-invisible\b/;
const EXIT = /^(acquired|exited?|ipo)$/i;
const CLOSED = /^closed$/i;
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

interface Listing {
	name: string;
	sectors: string[];
	tags: string[];
	url: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// a company filed under two sectors is one company under both
	const listings = new Map<string, Listing>();
	for (const section of html.split(SECTION).slice(1)) {
		const sector = tag(section.match(HEADING)?.[1] ?? '');
		for (const item of section.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name)) continue;
			const key = name.toLowerCase();
			const shown = [...item.matchAll(TAG)]
				.filter(([, classes]) => !HIDDEN.test(classes))
				.map(([, , text]) => tag(text))
				.filter(Boolean);
			const link = unescape(item.match(SITE)?.[1] ?? '');
			const listing = listings.get(key) ?? {
				name,
				sectors: [],
				tags: [],
				url: /^https?:\/\//.test(link) ? link : ''
			};
			if (sector && !listing.sectors.includes(sector)) listing.sectors.push(sector);
			for (const t of shown) if (!listing.tags.includes(t)) listing.tags.push(t);
			listings.set(key, listing);
		}
	}

	const companies = [...listings.values()].map(({ name, sectors, tags, url }) => {
		const exited = tags.some((t) => EXIT.test(t));
		return {
			name,
			category: [
				...sectors,
				...tags.filter((t) => !EXIT.test(t) && !CLOSED.test(t)),
				...tags.filter((t) => CLOSED.test(t)),
				// "Acquired" says how; "Exited" alone says only that
				...tags.filter((t) => EXIT.test(t) && !/^exited?$/i.test(t)),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url
		};
	});

	if (companies.length === 0) {
		throw new Error('firstcheque: no companies in the portfolio sections');
	}

	return companies;
}
