import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fifthwall.com/portfolio';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list sixteen to a page, which finsweet loads
// under itself as the page scrolls; the pages are walked here through
// webflow's own "next" links. every item names the company, and a company
// the fund is out of carries the way it went in its name — "Blend — Exited
// (NYSE: BLND)", "Knock — Exited, Acquired by RealPage (NASDAQ: RP)",
// "BitGo (NYSE: BTGO)" — which moves to the category; an "Exited" among the
// item's filter fields marks the rest, "Featured" is on every one and says
// nothing. the site is the button in the item's popup.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bteam_list-item\b)/;
const NAME = /class="portfolio_item-name\b[^"]*"[^>]*>([\s\S]*?)<\/p>/;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bbutton-new-dark\b/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
// the note after the name: a dash and how it went, or a listing in brackets
const NOTE = /^(.*?)\s*(?:\s[—–-]\s*(.+)|\(([A-Z]+:\s*[A-Z.]+)\))$/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Exited (NYSE: BLND)" -> "NYSE: BLND"; "Exited, Acquired by RealPage
// (NASDAQ: RP)" -> "Acquired by RealPage (NASDAQ: RP)"; "Exited" -> ""
function outcome(note: string): string {
	const rest = note.replace(/^exited\b[\s:,]*/i, '').trim();
	return tag(rest.replace(/^\(([^)]*)\)$/, '$1'));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const item of html.split(ITEM).slice(1)) {
			const listed = clean(item.match(NAME)?.[1] ?? '');
			const parts = listed.match(NOTE);
			const name = (parts?.[1] ?? listed).trim();
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const note = outcome(parts?.[2] ?? parts?.[3] ?? '');
			const filters = [...item.matchAll(CATEGORY)].map(([, c]) => clean(c));
			// a name saying "Acquired by Mindbody" is an exit whether or not the
			// item's filters caught up with it
			const exited =
				filters.some((c) => /^exited$/i.test(c)) ||
				/\b(exited|acquired|merged|ipo)\b|^[A-Z]+:\s*[A-Z.]+$/i.test(parts?.[2] ?? parts?.[3] ?? '');
			companies.push({
				name,
				category: [note, exited ? 'Exited' : ''].filter(Boolean).join(', '),
				url: unescape(item.match(SITE)?.[1] ?? '')
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('fifthwall: no companies in the portfolio list');
	}

	return companies;
}
