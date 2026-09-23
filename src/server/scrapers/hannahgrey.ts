import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.hannahgrey.com/portfolio-1';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, laid out in blocks: the portfolio is a wall of logos, each an
// image whose alt text — or, failing that, its file name — carries a key:
// "logo-for-moodypines". a script on the page looks each key up in a list kept
// hidden in a code block under the logos, a link and a line about each
// company, and points the logo at that link. no name is written anywhere but
// in the logos, so the companies are named from a list looked up once, keyed
// as the page keys them; a key missing from it is written out as it stands
// ("Moodypines") until it is added. the companies the fund is out of have an
// "Exited" band drawn across the logo itself, so those are listed here too.
// the hidden list also holds a few companies with no logo on the page (bigco,
// since renamed sotto, among them), which are left out.
const NAMES: Record<string, string> = {
	afference: 'Afference',
	amesa: 'Amesa',
	august: 'August',
	bennie: 'Bennie',
	bestomer: 'Bestomer',
	blee: 'Blee',
	cast: 'Cast',
	catch: 'Catch',
	creatium: 'Creatium',
	credo: 'Credo',
	defiant: 'Defiant',
	enlaye: 'Enlaye',
	escargot: 'Escargot',
	gateway: 'Gateway',
	glystn: 'Glystn',
	hint: 'HINT',
	mixus: 'mixus',
	moodypines: 'Moody Pines',
	neighborschools: 'NeighborSchools',
	outro: 'Outro',
	paiv: 'Paiv',
	rally: 'Rally',
	serv: 'SERV',
	signallift: 'Signal Lift',
	sotto: 'Sotto',
	stand: 'STAND+',
	starday: 'Starday',
	subject: 'Subject',
	sunfish: 'Sunfish',
	tendercare: 'tendercare',
	triangle: 'Triangle',
	trutharts: 'Truth Arts',
	tzafon: 'Tzafon',
	upsmith: 'UpSmith',
	wave: 'Wave',
	wilder: 'Wilder Artists',
	winslow: 'Winslow',
	workgrounds: 'Workgrounds'
};

// the logos with the "Exited" band across them
const EXITED = new Set(['gateway', 'neighborschools', 'rally']);

const BLOCK = /(?=<div[^>]*class="[^"]*\bfe-block\b)/;
const IS_IMAGE = /sqs-block-image|image-block/;
const ALT_KEY = /\balt="logo-for-([^"]+)"/;
const FILE_KEY = /data-src="[^"]*\/logo-for-([a-z0-9_-]+)/i;
const LINK = /<a[^>]*href="(https?:\/\/[^"]+)"/;
const SECTION = /<a\b[^>]*\bdata-portfolio-section="[^"]*"[^>]*>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const titled = (s: string) =>
	s
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "https://https://www.tzafon.ai/" -> "https://www.tzafon.ai/"
const repaired = (url: string) => unescape(url).trim().replace(/^https?:\/\/(?=https?:\/\/)/i, '');

// the hidden list's link for each key, the first where a key comes twice, as
// the page's script takes it
function sections(html: string): Map<string, string> {
	const links = new Map<string, string>();
	for (const [tag] of html.matchAll(SECTION)) {
		const key = unescape(tag.match(/data-portfolio-section="([^"]*)"/)?.[1] ?? '')
			.trim()
			.toLowerCase();
		if (!key || links.has(key)) continue;
		links.set(key, repaired(tag.match(/\bhref="([^"]*)"/)?.[1] ?? ''));
	}
	return links;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const links = sections(html);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of html.split(BLOCK).slice(1)) {
		if (!IS_IMAGE.test(block.slice(0, 600))) continue;
		// the page's script reads the key off the alt text, an underscore for a space
		const key = unescape(block.match(ALT_KEY)?.[1] ?? block.match(FILE_KEY)?.[1] ?? '')
			.replace('_', ' ')
			.trim()
			.toLowerCase();
		if (!key) continue;
		const name = NAMES[key] ?? titled(key);
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: EXITED.has(key) ? 'Exited' : '',
			url: links.get(key) || repaired(block.match(LINK)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('hannahgrey: no logos on the portfolio page — the layout moved');
	}

	return companies;
}
