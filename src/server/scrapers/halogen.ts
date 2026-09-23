import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://halogenvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// showit, served from wp engine: the page is loose elements placed by the
// pixel, in no order that says which belong together. a company is a square —
// a coloured tile under its logo, the logo linking its site and fading on
// hover to show a line about the company, which opens with its name ("Zette
// allows you to…", "Vurbl Media is…") — so what sits on a tile, an "Acquired
// by Mattel" among it, is read from where the stylesheet puts it. a line that
// doesn't open with the name is named from a list, keyed by how it opens.
//
// the ALL filter's block holds every company, those under its "Past
// Portfolio" heading kept with those words; each other filter has a block of
// its own, hidden until it is chosen, whose companies take the filter's
// label, and a company in no block but a filter's (steereo, under media) is
// kept all the same. the links are the page's, with its slips put right: a
// link it gives to more than one company stays only with the one it names
// (nyad's is on yard, doctours and krillpay too), and one with a second
// address run into it ("ysebeauty.com/://yingme.co/") is cut back to the first.
const LINES: [string, string][] = [
	['a creative play toy company', 'Seedling'],
	['child care, covered', 'Brella'],
	['data driven products for modern moms', 'Naya'],
	['priceline meets broadway', 'Broadway Roulette'],
	['the go-to destination for flexible', 'Werk'],
	['the infrastructure fabric for blockchain', 'BlockCypher']
];

const BLOCK = /<div id="([^"]+)" data-bid="[^"]*" class="sb\b/g;
const ELEMENT = /<(?:a|div)\b[^>]*\bclass="sie-([\w-]+) se\b[^"]*"[^>]*>/g;
const PLACE = /\.d \.sie-([\w-]+) \{([^}]*)\}/g;
const TEXT = /<(h\d|p|div|span)\b[^>]*class="se-t\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/;
const HREF = /\bhref="(https?:\/\/[^"]+)"/;
const SIMPLE = /^[\s\S]{0,300}?class="se-simple"/;
// the name, up to the verb the line goes on with
const OPENING =
	/^(.{1,40}?)\s+(?:is|are|was|allows|enables|helps|makes|builds|offers|creates|delivers|lets|harnesses|transforms|provides|connects|powers|brings|uses|gives|combines|develops|designs|empowers)\b/;
// a filter: a link that changes the page's state, its label the text in it
const FILTER = /<a\b[^>]*\bdata-state="[^"]*"[^>]*>\s*<h\d\b[^>]*class="se-t\b[^"]*"[^>]*>([^<]{2,60})</g;
const OUTCOME = /^(acquired|merged|ipo)\b/i;
const PAST = /^past portfolio$/i;
const STEALTH = /^stealth\b/i;
// a tile is a square of at least this many pixels a side
const TILE = 150;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two;
// a company's own comma ("Emerald Holding, Inc.") is simply dropped
const tag = (s: string) =>
	clean(s)
		.replace(/,\s*(?=(?:inc|llc|ltd)\b)/gi, ' ')
		.replace(/\s*,\s*/g, ' / ');

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

const titled = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');

// "https://www.ysebeauty.com/://yingme.co/" -> "https://www.ysebeauty.com/"
const repaired = (url: string) => unescape(url).trim().replace(/^(https?:\/\/[^/]+\/)[^/]*:\/\/.*$/i, '$1');

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
	hidden: boolean;
}

interface Element extends Box {
	simple: boolean;
	text: string;
	href: string;
}

interface Tile {
	box: Box;
	items: Element[];
}

interface Card {
	name: string;
	note: string;
	url: string;
	y: number;
	x: number;
}

// where the desktop layout puts each element
function places(html: string): Map<string, Box> {
	const boxes = new Map<string, Box>();
	const hidden = new Set<string>();
	for (const [, sid, rule] of html.matchAll(PLACE)) {
		if (/display:none/.test(rule)) hidden.add(sid);
		const px = (key: string) => Number(rule.match(new RegExp(`(?:^|;)${key}:(-?[\\d.]+)px`))?.[1]);
		const box = { x: px('left'), y: px('top'), w: px('width'), h: px('height'), hidden: false };
		if ([box.x, box.y, box.w, box.h].every(Number.isFinite)) boxes.set(sid, box);
	}
	for (const sid of hidden) {
		const box = boxes.get(sid);
		if (box) box.hidden = true;
	}
	return boxes;
}

function blocks(html: string): Map<string, string> {
	const starts = [...html.matchAll(BLOCK)].map((m) => ({ id: m[1], at: m.index ?? 0 }));
	return new Map(starts.map((b, i) => [b.id, html.slice(b.at, starts[i + 1]?.at ?? html.length)]));
}

function elements(block: string, boxes: Map<string, Box>): Element[] {
	const starts = [...block.matchAll(ELEMENT)].map((m) => ({ sid: m[1], tag: m[0], at: m.index ?? 0 }));
	return starts.flatMap((e, i) => {
		const box = boxes.get(e.sid);
		if (!box || box.hidden) return [];
		const body = block.slice(e.at, starts[i + 1]?.at ?? block.length);
		return [
			{
				...box,
				simple: SIMPLE.test(body),
				text: clean(body.match(TEXT)?.[2] ?? ''),
				href: repaired(e.tag.match(HREF)?.[1] ?? '')
			}
		];
	});
}

// every element goes to the tile its middle falls on
function tiles(list: Element[]): { tiles: Tile[]; loose: Element[] } {
	const found: Tile[] = list
		.filter((e) => e.simple && e.w >= TILE && e.h >= TILE)
		.map((box) => ({ box, items: [] }));
	const loose: Element[] = [];
	for (const e of list) {
		if (e.simple) continue;
		const [cx, cy] = [e.x + e.w / 2, e.y + e.h / 2];
		const tile = found.find(
			({ box }) => cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h
		);
		if (tile) tile.items.push(e);
		else loose.push(e);
	}
	return { tiles: found.filter((t) => t.items.length > 0), loose };
}

function nameOf(line: string): string {
	const opening = line.toLowerCase();
	const listed = LINES.find(([start]) => opening.startsWith(start));
	if (listed) return listed[1];
	const name = line.match(OPENING)?.[1]?.trim() ?? '';
	return name && !/[,;:]\s|\.\s|[!?]/.test(name) && name.split(' ').length <= 5 ? name : '';
}

function cards(list: Element[]): { cards: Card[]; loose: Element[] } {
	const { tiles: found, loose } = tiles(list);
	const read: Card[] = [];
	for (const { box, items } of found) {
		const texts = items.map((e) => e.text).filter(Boolean);
		const url = items.find((e) => e.href)?.href ?? '';
		// a line that names no one leaves the address to go by, until it is listed
		const name =
			nameOf(texts.find((t) => !OUTCOME.test(t)) ?? '') || titled(hostOf(url).split('.')[0] ?? '');
		if (!name) continue;
		read.push({
			name,
			note: texts.find((t) => OUTCOME.test(t)) ?? '',
			url,
			y: box.y,
			x: box.x
		});
	}
	return { cards: read.sort((a, b) => a.y - b.y || a.x - b.x), loose };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const boxes = places(html);
	const byId = blocks(html);
	const everything = byId.get('all');
	if (!everything) {
		throw new Error('halogen: the portfolio page has no ALL block — the layout moved');
	}

	// the ALL block's companies, and where its past portfolio begins
	const all = cards(elements(everything, boxes));
	const pastFrom = all.loose.find((e) => PAST.test(e.text))?.y ?? Infinity;

	// each filter's label, found by the block named after it
	const labels = new Map<string, string>();
	for (const [, text] of html.matchAll(FILTER)) {
		const label = clean(text);
		const id = slug(label);
		if (id && id !== 'all' && byId.has(id) && !labels.has(id)) labels.set(id, label);
	}
	const filed = new Map<string, string[]>();
	const extra: Card[] = [];
	const known = new Set(all.cards.map((c) => c.name.toLowerCase()));
	for (const [id, label] of labels) {
		for (const card of cards(elements(byId.get(id) ?? '', boxes)).cards) {
			const key = card.name.toLowerCase();
			filed.set(key, [...(filed.get(key) ?? []), tag(label)]);
			if (!known.has(key)) {
				known.add(key);
				extra.push(card);
			}
		}
	}

	// a link on more than one company stays with the one it names
	const everyCard = [...all.cards, ...extra];
	const holders = new Map<string, Card[]>();
	for (const card of everyCard) {
		const link = card.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
		if (link) holders.set(link, [...(holders.get(link) ?? []), card]);
	}
	const squashed = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	for (const shared of holders.values()) {
		if (new Set(shared.map((c) => c.name.toLowerCase())).size < 2) continue;
		for (const card of shared) {
			if (!squashed(hostOf(card.url)).includes(squashed(card.name))) card.url = '';
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of everyCard) {
		const key = card.name.toLowerCase();
		if (STEALTH.test(card.name) || seen.has(key)) continue;
		seen.add(key);
		const past = card.y > pastFrom && all.cards.includes(card);
		companies.push({
			name: card.name,
			category: [
				...(filed.get(key) ?? []),
				card.note ? tag(card.note) : past ? 'Past portfolio' : '',
				card.note ? 'Exited' : ''
			]
				.filter((t, i, list) => t && list.indexOf(t) === i)
				.join(', '),
			url: card.url
		});
	}

	if (companies.length === 0) {
		throw new Error('halogen: no companies on the portfolio page');
	}

	return companies;
}
