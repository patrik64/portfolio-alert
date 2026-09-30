import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://audacityvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is a run of cards under "Our Portfolio
// Companies", each a picture, the company's logo, a line about it and its
// stage, region and status ("Active", "Acquired"), and under "Past
// Investments" a strip of logos. no company is linked, and the logos are
// named nowhere the page shows, their alt text empty, so the names are
// kept here by the logos' images, as the logos read. a card's logo not
// listed here falls back to a name the card sets in bold, and a strip's to
// the name the page's builder gave its layer, until it is added. the stage
// and region are kept as tags, a status other than "Active" is how the
// fund got out, and the strip's companies are tagged "Past Investment".
const LOGOS: Record<string, string> = {
	'7SNzXcQDtMG3jj5WRdFoc5hlA': 'PlaySuper',
	ENDQ8XI599XlWSS910MKSPQaNc: 'Koyal AI',
	PNJUeanSnSuFHizAJftFPriEZQ: 'Surface Labs',
	R4iTCKgnlA5oM1LwVAJU8wOuDI: 'Postudio',
	thUQXbdMs6jMNtXEonS4GirtBU: 'VideoVerse',
	u2VreV0cRnF0rU2dKBCP2ZqPrQ: 'Rusk Media',
	zJU4YI24SarNH4aXnrPw9ijG4o: 'Bold Care',
	// the strip under "Past Investments"
	'230Nx0dubrFgcDj5xjczDqxFZI': 'Salud',
	'4mxbDVXadGN7CxqtlU9ArVmpWvU': 'Rooter',
	'4n5cE72C1zh4zp9a3Og8vqyU': 'Grip',
	'7EPWGLdmnb2WB2XTn5OPdTSYQ': 'The New Shop',
	'8hiAblcLxk4MmRSdbbdJWCR4': 'The Ayurveda Experience',
	Ag3Dpem8TSh0kytUatogE0i6s: 'Woovly',
	B9RxzE31OQKV2XDEDtv3EUvvOB4: 'Gericare',
	EXuPiVq0HCagySvNivAkIGyV7c: 'Recykal',
	I5aoFCZ5ONIerIdC7XH2bIULw: 'ClickPost',
	PVxKHlPkzF9OwJ0OFdr7NxBK14: 'boAt',
	XnMyVehvcosJX5S89j8Aj3o7i0: 'Easebuzz',
	zbWQVQ0l7zXc4FACwJ0Pvd4BjM: 'Zypp'
};

const PORTFOLIO = />\s*Our Portfolio Companies\s*</i;
const PAST = />\s*Past Investments\s*</i;
const HEADING = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g;
// a card is drawn once per screen size; each opens on its content
const CARD = /(?=\bdata-framer-name="Content")/;
const IMAGE = /<img\b[^>]*\bsrc="https:\/\/framerusercontent\.com\/images\/([\w-]+)\.\w+/;
const LINE = /<p\b[^>]*>([\s\S]*?)<\/p>/;
const BOLD = /<strong\b[^>]*>([\s\S]*?)<\/strong>/;
const FIELD = /<h4\b[^>]*>\s*(Stage|Region|Status)\s*<\/h4>\s*<\/div>\s*<div\b[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
// the strip's logos, each in a layer named by the page's builder
const STRIP_LOGO =
	/<div\b[^>]*\bdata-framer-name="([^"]*)"[^>]*>\s*<div\b[^>]*\bdata-framer-background-image-wrapper="true"[^>]*>\s*<img\b[^>]*\bsrc="https:\/\/framerusercontent\.com\/images\/([\w-]+)\.\w+/g;
// a layer named for its file, "Recykal-Logo 130x30-pix", or not at all
const LAYER_FILE = /[-_\s]*\blogo\b.*$/i;
const HASH = /^[0-9a-f]{16,}$/i;
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

	// the cards run from their heading to the strip's, and the strip to the
	// next heading after its own, drawn once per screen size
	const pastAt = html.search(PAST);
	const cardsAt = Math.max(0, html.search(PORTFOLIO));
	const cards = html.slice(cardsAt, pastAt > cardsAt ? pastAt : undefined);
	let strip = '';
	if (pastAt >= 0) {
		const next = [...html.slice(pastAt).matchAll(HEADING)].find(([, , text]) => !PAST.test(`>${clean(text)}<`));
		strip = html.slice(pastAt, next?.index !== undefined ? pastAt + next.index : undefined);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, tags: string[]) => {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({ name, category: tags.filter((t, i, all) => t && all.indexOf(t) === i).join(', '), url: PAGE_URL });
	};

	for (const card of cards.split(CARD).slice(1)) {
		const fields = new Map([...card.matchAll(FIELD)].map(([, key, value]) => [key.toLowerCase(), tag(value)]));
		if (!fields.has('stage')) continue;
		const line = card.match(LINE)?.[1] ?? '';
		const name = LOGOS[card.match(IMAGE)?.[1] ?? ''] ?? clean(line.match(BOLD)?.[1] ?? '');
		const status = fields.get('status') ?? '';
		const out = status !== '' && !/^active$/i.test(status);
		add(name, [fields.get('stage') ?? '', fields.get('region') ?? '', out ? status : '', out ? 'Exited' : '']);
	}
	for (const [, layer, image] of strip.matchAll(STRIP_LOGO)) {
		const named = clean(layer).replace(LAYER_FILE, '');
		add(LOGOS[image] ?? (HASH.test(named) ? '' : named), ['Past Investment']);
	}
	if (companies.length === 0) {
		throw new Error('audacity: no companies on the portfolio page');
	}

	return companies;
}
