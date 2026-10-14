import type { ScrapedCompany } from './types';

const BASE_URL = 'https://earlygame.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is a grid of cards, the whole of it in the
// page and drawn once a breakpoint, a card a company linking its story
// here, with its name, a line about it and its sectors ("B2B, DevTools"),
// and for one the fund is done with a badge over its picture — "Exited",
// or "RIP" for one that closed. a company's story gives no site, so each
// company links it. the sectors are kept as tags, an exit with the Exited
// tag and a closure with the Closed tag.

const CARD = /<a aria-label="project-item"[^>]*\bhref="(\.\/portfolio\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
// the card's texts in order: a badge, the name, its line, "/", its sectors, "/"
const TEXT = /<(h1|p)\b[^>]*>([\s\S]*?)<\/\1>/g;
const EXITED = /^exited$/i;
const CLOSED = /^(?:rip|closed)$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, path, card] of html.matchAll(CARD)) {
		const texts = [...card.matchAll(TEXT)].map(([, element, text]) => ({ element, text: clean(text) }));
		const at = texts.findIndex(({ element }) => element === 'h1');
		const name = at < 0 ? '' : texts[at].text;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badges = texts.slice(0, at).map(({ text }) => text);
		const rest = texts.slice(at + 1).map(({ text }) => text);
		const slash = rest.indexOf('/');
		const sectors = slash < 0 ? '' : (rest[slash + 1] ?? '');
		companies.push({
			name,
			category: [
				...sectors
					.split(/[,;]/)
					.map(tag)
					.filter((t) => t !== '/'),
				badges.some((b) => EXITED.test(b)) ? 'Exited' : '',
				badges.some((b) => CLOSED.test(b)) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: new URL(unescape(path), `${BASE_URL}/`).href
		});
	}

	if (companies.length === 0) {
		throw new Error('earlygame: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
