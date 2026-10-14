import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.lunar.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a grid of cards, rendered on the server, a
// card a company linking its site, with its name after an "@", a line
// about it, and a badge on a company that was sold ("Acquired by
// Databricks", the card then linking the buyer's announcement). the cards
// decide who is listed. the page's own script holds the list the cards are
// drawn from, adding each company's theme — filtered by as "Infra",
// "Applications", "Tech-Bio", "Autonomy" — the stage the fund came in at
// and its country, read as a bonus: when the script cannot be read, the
// companies keep their sales and lose only those tags. the theme, the stage
// and the country are kept as tags, a sale as "Acquired by …" with the
// Exited tag. the "Stealth" cards name no one and are left out.

const CARD = /(?=<a href="[^"]*" target="_blank" class="hover:underline"><div class="card\b)/;
const SITE = /^<a href="([^"]*)"/;
const NAME = /<h4\b[^>]*>@(?:<!-- -->)?([\s\S]*?)<\/h4>/;
const BADGE = /<span title="([^"]*)"/;
const SCRIPT = /src="(\/_next\/static\/chunks\/app\/portfolio\/page-[\w-]+\.js)"/;
// a company in the script: an object literal opening on its title
const ENTRY = /\{title:"((?:[^"\\]|\\.)*)"((?:[^{}]|\{[^{}]*\})*)\}/g;
const FIELD = (name: string) => new RegExp(`\\b${name}:"((?:[^"\\\\]|\\\\.)*)"`);
// the filter buttons: a label and the theme it shows
const THEME = /\["([^"]+)","([\w-]+)"\]/g;
const BUYER = /^acquired by\s+(.+)$/i;
// countries the script writes other than by their codes
const PLACES: Record<string, string> = { UK: 'United Kingdom', EU: 'Europe' };
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Extra {
	theme: string;
	stage: string;
	geo: string;
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

// a javascript string's contents, its escapes undone where they are json's
const literal = (s: string) => {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
};

const regions = new Intl.DisplayNames(['en'], { type: 'region' });

// "DE" -> "Germany"
function placeOf(code: string): string {
	if (PLACES[code]) return PLACES[code];
	if (!/^[A-Z]{2}$/.test(code)) return '';
	try {
		const name = regions.of(code);
		return name && name !== code ? name : '';
	} catch {
		return '';
	}
}

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
		const themes = new Map([...script.matchAll(THEME)].map(([, label, slug]) => [slug, label]));
		for (const [, title, body] of script.matchAll(ENTRY)) {
			const field = (name: string) => clean(literal(body.match(FIELD(name))?.[1] ?? ''));
			const theme = field('theme');
			extras.set(clean(literal(title)).toLowerCase(), {
				theme: themes.get(theme) ?? theme,
				stage: field('stage'),
				geo: placeOf(field('geo'))
			});
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
		const buyer = clean(card.match(BADGE)?.[1] ?? '').match(BUYER)?.[1];
		const extra = extras.get(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(extra?.theme ?? ''),
				tag(extra?.stage ?? ''),
				tag(extra?.geo ?? ''),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('lunar: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
