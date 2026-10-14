import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.finchcapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// tanstack start, rendered on the server: the portfolio page is a grid of
// cards, the whole portfolio, a card a company with its name, a line about
// it, its headquarters, the "structural moats" the fund sees in it and a
// link to its site. the cards decide who is listed. the page filters them
// by status ("current", "exited") and sector ("Payments", "CFO Office"),
// which the cards do not show: the page's own script holds the list the
// cards are drawn from, giving both, and is read as a bonus — when it
// cannot be read, the companies lose only those tags. the sector and the
// headquarters are kept as tags, an exit with the Exited tag; the moats
// are the fund's reading of a company, not what it is.

const CARD = /(?=<div class="group relative editorial-card\b)/;
const NAME = /<h3 class="type-h3[^"]*">([\s\S]*?)<\/h3>/;
const HQ = /Headquarters:<\/span><span\b[^>]*>([\s\S]*?)<\/span>/;
const SITE = /<a href="([^"]*)"[^>]*>\s*Visit Website/;
const SCRIPT = /"(\/assets\/portfolio-[\w-]+\.js)"/;
// a company in the script: an object literal opening on its name
const ENTRY = /\{name:`([^`]*)`((?:[^{}`]|`[^`]*`)*)\}/g;
const FIELD = (name: string) => new RegExp(`\\b${name}:\`([^\`]*)\``);
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Extra {
	sector: string;
	exited: boolean;
}

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

// the script's word on each company, by name; nothing when it will not load
async function extrasOf(html: string): Promise<Map<string, Extra>> {
	const extras = new Map<string, Extra>();
	const path = html.match(SCRIPT)?.[1];
	if (!path) return extras;
	try {
		const resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			await resp.body?.cancel();
			return extras;
		}
		const script = await resp.text();
		for (const [, name, body] of script.matchAll(ENTRY)) {
			const field = (key: string) => clean(body.match(FIELD(key))?.[1] ?? '');
			extras.set(clean(name).toLowerCase(), { sector: field('sector'), exited: EXITED.test(field('status')) });
		}
	} catch {
		// the tags it adds are a bonus; the cards stand without them
	}
	return extras;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const extras = await extrasOf(html);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const extra = extras.get(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(extra?.sector ?? ''),
				...clean(card.match(HQ)?.[1] ?? '').split(',').map(clean),
				extra?.exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('finch: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
