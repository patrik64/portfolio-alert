import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://halogenvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// showit, served from wp engine: the page is elements placed by the pixel.
// a company is its logo linking its site, a line about the company that
// opens with its name ("Zette allows you to…", "Vurbl Media is…") and, on
// one the fund is out of, how it went ("Acquired by Mattel"). since october
// 2026 most companies' elements are grouped, as the page hovers them
// together, and are read by their group; the rest still lie loose in their
// block, and are read by their column — the line beside the link it shares
// one with, the outcome under them. a line that doesn't open with the name
// is named from a list, keyed by how it opens. a few loose lines lie far
// below the bottom of their block, where the page no longer shows them, and
// are left alone.
//
// the ALL filter's blocks hold every current company; the past portfolio
// has blocks of its own, headed "Past Portfolio", whose companies are kept
// with those words; each other filter has blocks of its own, hidden until it
// is chosen, whose companies take the filter's label, and a company in no
// block but a filter's is kept all the same. the page cuts a long block into
// numbered ones ("all-1" to "all-13") and names a filter's after the
// filter's last words ("media" for "Future of Media"), so a name's blocks
// are read together. the links are the page's, with its slips put right: a
// link it gives to more than one company stays only with the one it names
// (toucan's is on this is l too), and one with a second address run into it
// ("ysebeauty.com/://yingme.co/") is cut back to the first.
const LINES: [string, string][] = [
	['a creative play toy company', 'Seedling'],
	['child care, covered', 'Brella'],
	['data driven products for modern moms', 'Naya'],
	['priceline meets broadway', 'Broadway Roulette'],
	['the go-to destination for flexible', 'Werk'],
	['the infrastructure fabric for blockchain', 'BlockCypher'],
	// "This is L is a popular personal care brand…"
	['this is l is', 'This is L']
];

const BLOCK = /<div id="([^"]+)" data-bid="[^"]*" class="sb\b/g;
// a group, by its id and its key; the elements in it carry the key in theirs
// ("all-1_0" holds "all-1_oJ4u8kmYE_0", "all-1_oJ4u8kmYE_1"...)
const GROUP = /<div data-sid="([\w-]+)" class="sie-\1 si-group ([\w-]+)\b/g;
const ELEMENT = /<(?:a|div)\b[^>]*\bclass="sie-([\w-]+) se\b[^"]*"[^>]*>/g;
// where the wide layout puts an element, and how tall it makes a block
const PLACE = /\.d \.sie-([\w-]+) \{([^}]*)\}/g;
const HEIGHT = /\.d \.sib-([\w-]+) \{[^}]*\bheight:([\d.]+)px/g;
const TEXT = /<(h\d|p|div|span)\b[^>]*class="se-t\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/;
const HREF = /\bhref="(https?:\/\/[^"]+)"/;
// the name, up to the verb the line goes on with
const OPENING =
	/^(.{1,40}?)\s+(?:is|are|was|allows|enables|helps|makes|builds|offers|creates|delivers|lets|harnesses|transforms|provides|connects|powers|brings|uses|gives|combines|develops|designs|empowers)\b/;
// a filter: a link that changes the page's state, its label the text in it
const FILTER = /<a\b[^>]*\bdata-state="[^"]*"[^>]*>\s*<h\d\b[^>]*class="se-t\b[^"]*"[^>]*>([^<]{2,60})</g;
const OUTCOME = /^(acquired|merged|ipo)\b/i;
const STEALTH = /^stealth\b/i;

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
}

interface Element {
	sid: string;
	href: string;
	text: string;
}

interface Card {
	name: string;
	note: string;
	url: string;
}

interface Layout {
	boxes: Map<string, Box>;
	heights: Map<string, number>;
}

// where the wide layout puts each element, and how tall it makes each block
function layout(html: string): Layout {
	const boxes = new Map<string, Box>();
	for (const [, sid, rule] of html.matchAll(PLACE)) {
		const px = (key: string) => Number(rule.match(new RegExp(`(?:^|;)${key}:(-?[\\d.]+)px`))?.[1]);
		const box = { x: px('left'), y: px('top'), w: px('width'), h: px('height') };
		if ([box.x, box.y, box.w, box.h].every(Number.isFinite)) boxes.set(sid, box);
	}
	const heights = new Map([...html.matchAll(HEIGHT)].map(([, id, height]) => [id, Number(height)]));
	return { boxes, heights };
}

function blocks(html: string): Map<string, string> {
	const starts = [...html.matchAll(BLOCK)].map((m) => ({ id: m[1], at: m.index ?? 0 }));
	return new Map(starts.map((b, i) => [b.id, html.slice(b.at, starts[i + 1]?.at ?? html.length)]));
}

// every block of a name, numbered or not, in the order the page keeps them
function named(byId: Map<string, string>, base: string): [string, string][] {
	return [...byId].filter(
		([id]) => id === base || (id.startsWith(`${base}-`) && /^\d+$/.test(id.slice(base.length + 1)))
	);
}

// the elements of a block, each with its link and its text
function elements(body: string): Element[] {
	const starts = [...body.matchAll(ELEMENT)].map((m) => ({ sid: m[1], tag: m[0], at: m.index ?? 0 }));
	return starts.map((e, i) => ({
		sid: e.sid,
		href: repaired(e.tag.match(HREF)?.[1] ?? ''),
		text: clean(body.slice(e.at, starts[i + 1]?.at ?? body.length).match(TEXT)?.[2] ?? '')
	}));
}

function nameOf(line: string): string {
	const opening = line.toLowerCase();
	const listed = LINES.find(([start]) => opening.startsWith(start));
	if (listed) return listed[1];
	const name = line.match(OPENING)?.[1]?.trim() ?? '';
	return name && !/[,;:]\s|\.\s|[!?]/.test(name) && name.split(' ').length <= 5 ? name : '';
}

// a line that names no one leaves the address to go by, until it is listed
const nameFor = (line: string, url: string) => nameOf(line) || titled(hostOf(url).split('.')[0] ?? '');

// whether a box's middle falls within another's width
const under = (box: Box, column: Box) => {
	const middle = box.x + box.w / 2;
	return middle >= column.x && middle <= column.x + column.w;
};

// the companies in one block: those in groups, then those lying loose
function cards(id: string, body: string, { boxes, heights }: Layout): Card[] {
	const all = elements(body);
	const read: Card[] = [];
	const grouped = new Set<string>();
	// an outcome standing on its own, under a loose company's column
	const badges: { box: Box; note: string }[] = [];
	for (const [, sid, key] of body.matchAll(GROUP)) {
		const prefix = `${sid.slice(0, sid.lastIndexOf('_'))}_${key}_`;
		const items = all.filter((e) => e.sid.startsWith(prefix));
		for (const e of items) grouped.add(e.sid);
		const texts = items.map((e) => e.text).filter(Boolean);
		const line = texts.find((t) => !OUTCOME.test(t)) ?? '';
		const note = texts.find((t) => OUTCOME.test(t)) ?? '';
		const url = items.find((e) => e.href)?.href ?? '';
		const box = boxes.get(sid);
		if (!line && !url && note && box) {
			badges.push({ box, note });
			continue;
		}
		const name = nameFor(line, url);
		if (name) read.push({ name, note, url });
	}

	const bottom = heights.get(id) ?? Infinity;
	const loose = all.flatMap((e) => {
		const box = boxes.get(e.sid);
		return grouped.has(e.sid) || !box || box.y >= bottom ? [] : [{ ...e, box }];
	});
	for (const e of loose) if (!e.href && OUTCOME.test(e.text)) badges.push({ box: e.box, note: e.text });
	const links = loose.filter((e) => e.href);
	for (const line of loose) {
		if (!line.text || OUTCOME.test(line.text)) continue;
		const link = links.find((l) => under(line.box, l.box));
		const url = link?.href ?? '';
		const name = nameFor(line.text, url);
		if (!name) continue;
		const column = link?.box ?? line.box;
		const badge = badges.find((b) => under(b.box, column) && b.box.y >= column.y);
		read.push({ name, note: badge?.note ?? '', url });
	}
	return read;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const placed = layout(html);
	const byId = blocks(html);
	const cardsIn = (base: string) => named(byId, base).flatMap(([id, body]) => cards(id, body, placed));
	if (named(byId, 'all').length === 0) {
		throw new Error('halogen: the portfolio page has no ALL block — the layout moved');
	}

	// the ALL blocks' companies, and the past portfolio's
	const all = cardsIn('all');
	const past = cardsIn('past-portfolio');

	// each filter's label, found by the blocks named after its last words
	const labels = new Map<string, string>();
	for (const [, text] of html.matchAll(FILTER)) {
		const label = clean(text);
		const id = slug(label.replace(/^future of\s+/i, '').replace(/&/g, ' and '));
		if (id && id !== 'all' && named(byId, id).length && !labels.has(id)) labels.set(id, label);
	}
	const filed = new Map<string, string[]>();
	const extra: Card[] = [];
	const known = new Set(all.map((c) => c.name.toLowerCase()));
	const gone = new Set<string>();
	for (const card of past) {
		const key = card.name.toLowerCase();
		if (known.has(key)) continue;
		known.add(key);
		gone.add(key);
		extra.push(card);
	}
	for (const [id, label] of labels) {
		for (const card of cardsIn(id)) {
			const key = card.name.toLowerCase();
			filed.set(key, [...(filed.get(key) ?? []), tag(label)]);
			if (!known.has(key)) {
				known.add(key);
				extra.push(card);
			}
		}
	}

	// a link on more than one company stays with the one it names
	const everyCard = [...all, ...extra];
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
		companies.push({
			name: card.name,
			category: [
				...(filed.get(key) ?? []),
				card.note ? titled(tag(card.note)) : gone.has(key) ? 'Past portfolio' : '',
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
