import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.axeleo.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro: the portfolio page is a grid of cards served whole, each naming
// the company and linking its site, or the fund's own story of it, and
// carrying the filters it answers to by their places in the filter list,
// whose buttons give each place its sector ("Greentech", "Digital") or
// its standing ("active", or "exit,failure" for the ones the fund is out
// of). a card the fund is out of says on its picture how it went, "Exit.
// Docebo" or "Exit. MBO", or "We tried" for the ones that failed, kept as
// written. cards named only "Stealth" are left out. one card links another
// company's site under that company's name, so a link labelled with
// another card's name is not taken.

const FILTER = /<button\b[^>]*\bdata-filter-index="(\d+)"[^>]*>/g;
const ATTR = (name: string) => new RegExp(`\\bdata-${name}="([^"]*)"`);
const CARD = /(?=<div\b[^>]*\bdata-filter-indices=")/;
const INDICES = /^<div\b[^>]*\bdata-filter-indices="([^"]*)"/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const BADGE = /<div\b[^>]*\bbg-heavy-bg\b[^>]*>([\s\S]*?)<\/div>/;
const NAME = /<h3\b[^>]*>([\s\S]*)$/;
const LABEL = /^\s*<\/div>\s*<span\b[^>]*>([\s\S]*?)<\/span>/;
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

// "Exit. Docebo" -> "Exit: Docebo"; "We tried" stays
const outcome = (badge: string) => tag(badge).replace(/^exit\s*[.:]\s*/i, 'Exit: ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the filter list is drawn twice, for wide screens and narrow
	const filters = new Map<string, { sector: string; status: string }>();
	for (const [button, index] of html.matchAll(FILTER)) {
		if (filters.has(index)) continue;
		filters.set(index, {
			sector: tag(button.match(ATTR('sector'))?.[1] ?? ''),
			status: unescape(button.match(ATTR('status'))?.[1] ?? '')
		});
	}

	const cards: { name: string; indices: string[]; href: string; badge: string; label: string }[] = [];
	for (const card of html.split(CARD).slice(1)) {
		// the card's own markup ends with its name and the label under it
		const end = card.indexOf('</h3>');
		if (end < 0) continue;
		const head = card.slice(0, end);
		cards.push({
			name: clean(head.match(NAME)?.[1] ?? ''),
			indices: (card.match(INDICES)?.[1] ?? '').split(',').map((i) => i.trim()),
			href: unescape(head.match(LINK)?.[1] ?? '').trim(),
			badge: clean(head.match(BADGE)?.[1] ?? ''),
			label: clean(card.slice(end + '</h3>'.length).match(LABEL)?.[1] ?? '')
		});
	}
	const names = new Set(cards.map(({ name }) => name.toLowerCase()));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { name, indices, href, badge, label } of cards) {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const found = indices.map((i) => filters.get(i)).filter((f) => f !== undefined);
		const exited = found.some(({ status }) => /\b(exit|failure)\b/i.test(status)) || badge !== '';
		const others = label.toLowerCase() !== name.toLowerCase() && names.has(label.toLowerCase());
		let url = PAGE_URL;
		if (href && !others) {
			try {
				const resolved = new URL(href, PAGE_URL);
				if (/^https?:$/.test(resolved.protocol)) url = resolved.href;
			} catch {
				// a link that does not parse leaves the portfolio page
			}
		}
		companies.push({
			name,
			category: [...found.map(({ sector }) => sector), exited && badge ? outcome(badge) : '', exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url
		});
	}
	if (companies.length === 0) {
		throw new Error('axeleo: no companies on the portfolio page');
	}

	return companies;
}
