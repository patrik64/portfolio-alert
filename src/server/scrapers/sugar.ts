import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sugarcap.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the whole site on one page, and the portfolio in two shapes.
//
// the current book is grouped under "Consumer" and "Software", and each tile
// is a link whose aria-label names the company. below it the fund keeps its
// "Enduring Companies" — older holdings, several marked "Acquired by ..." —
// which are tiles of a different shape, naming the company in a span instead.
//
// the second shape is shared with the partners' photographs and the blog
// cards, so a tile counts only when it both names something and points off the
// fund's own site: partners link to internal pages, and the blog cards name
// nobody.

const LABELLED = /<a href="(https?:\/\/[^"]+)"[^>]*aria-label="([^"]*?) website \(opens in new tab\)"/g;
const HEADING = /<h2 class="font-serif[^"]*"[^>]*>([^<]*)<\/h2>/g;
const CARD = /<a\b[^>]*liftCard[^>]*>/g;
const HREF = /href="([^"]*)"/;
const CARD_NAME = /<span class="mt-3 block[^"]*"[^>]*>([^<]*)<\/span>/;
const CARD_NOTE = /<span class="mt-0\.5 block[^"]*"[^>]*>([^<]*)<\/span>/;
const ACQUIRED = /^acquired\b/i;
const CARD_MAX = 2200;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index, text: clean(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string, url: string) => {
		if (!name || seen.has(name)) return;
		seen.add(name);
		companies.push({ name, category, url });
	};

	for (const m of html.matchAll(LABELLED)) {
		add(clean(m[2]), headings.filter((h) => h.at < m.index).pop()?.text ?? '', m[1]);
	}

	// a card runs to its own closing tag; reading past it would borrow the next
	// company's "acquired by" note
	const cards = [...html.matchAll(CARD)];
	for (let i = 0; i < cards.length; i++) {
		const m = cards[i];
		const href = m[0].match(HREF)?.[1] ?? '';
		if (!/^https?:\/\//.test(href)) continue;
		const from = m.index + m[0].length;
		const card = html.slice(from, Math.min(cards[i + 1]?.index ?? from + CARD_MAX, from + CARD_MAX));
		const name = clean(card.match(CARD_NAME)?.[1] ?? '');
		if (!name) continue;
		const note = clean(card.match(CARD_NOTE)?.[1] ?? '');
		add(name, ACQUIRED.test(note) ? 'Acquired' : '', href);
	}

	if (companies.length === 0) {
		throw new Error('sugar: no companies on the portfolio page');
	}

	return companies;
}
