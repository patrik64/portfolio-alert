import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://cantos.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next, rendered on the server: the home page's portfolio is a scroll of
// cards, drawn more than once for the animation, each the company's name
// linked to its site over what it does and the round the fund came in at.
// a company not yet announced is "[REDACTED]" and is left out, to be picked
// up under its own name. nothing marks an exit.

const CARD = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?<\/a>/g;
const NAME = /<span\b[^>]*\bclass="[^"]*\bfont-serif\b[^"]*"[^>]*>([\s\S]*?)<\/span>/;
// a fact of the card: its label and what it says, "Round" and "Seed"
const FACT = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g;
const HIDDEN = /^\[?redacted\]?$|^stealth\b/i;

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [card, href] of html.matchAll(CARD)) {
		const facts = new Map([...card.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), tag(value)]));
		if (!facts.size) continue;
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || HIDDEN.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: facts.get('round') ?? '', url: unescape(href) });
	}
	if (companies.length === 0) {
		throw new Error('cantos: no companies on the page');
	}

	return companies;
}
