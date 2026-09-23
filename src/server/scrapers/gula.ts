import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.gula.tech/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace's fluid engine. each section of the page is a grid of blocks,
// and on a desktop every row of one is a label, a logo linking the company's
// site and a line about the company — but the blocks come in no such order;
// the stylesheet places each by row and column. so a logo is filed under the
// label to its left in its row, and under its section's heading
// ("Cybersecurity Companies") as well. no name is written anywhere but in the
// logos, so a company is known by the address it links to, under the name it
// gives itself, looked up once; one missing from the list is named after its
// address until it is added. under "Historical Exits" each row is the year of
// a sale, its logos linking the news of it rather than the company, so those
// are known by their image files instead.
const NAMES: Record<string, string> = {
	'1kosmos.com': '1Kosmos',
	'anno.ai': 'Anno.ai',
	'automox.com': 'Automox',
	'bemopro.com': 'BEMO',
	'conceal.io': 'Conceal',
	'cybrary.it': 'Cybrary',
	'dnsfilter.com': 'DNSFilter',
	'gravwell.io': 'Gravwell',
	'greynoise.io': 'GreyNoise',
	'halcyon.ai': 'Halcyon',
	'he360.com': 'HawkEye 360',
	'huntress.com': 'Huntress',
	'manticore.ai': 'ManticoreAI',
	'onsights.io': 'Onsights',
	'oomnitza.com': 'Oomnitza',
	'pixm.net': 'Pixm',
	'prisidio.com': 'Prisidio',
	'racktopsystems.com': 'RackTop Systems',
	'rad.security': 'RAD Security',
	'sandflysecurity.com': 'Sandfly Security',
	'scythe.io': 'SCYTHE',
	'secondfront.com': 'Second Front',
	'senteon.co': 'Senteon',
	'starseer.ai': 'Starseer',
	'surefirecyber.com': 'Surefire Cyber',
	'threater.com': 'threatER',
	'torevmotors.com': 'Torev Motors',
	'trinitycyber.com': 'Trinity Cyber',
	'velocityblack.io': 'VelocityBlack',
	'vizlings.com': 'Vizlings',
	'wave-engine.com': 'Wave Engine',
	'x-energy.com': 'X-energy'
};

// the exits, by the logo's file: "500x175_securitytrails.jpg"
const EXITS: Record<string, string> = {
	boldend: 'BoldEnd',
	cnxt: 'CryptoniteNXT',
	eastwind: 'Eastwind',
	fend: 'Fend',
	flashpoint: 'Flashpoint',
	inky: 'INKY',
	newedge: 'NewEdge',
	nsw: 'Network Security Wizards',
	onionid: 'Onion ID',
	polarity: 'Polarity',
	protego: 'Protego',
	redowl: 'RedOwl',
	securecircle: 'SecureCircle',
	securitytrails: 'SecurityTrails',
	stackrox: 'StackRox',
	tenable: 'Tenable',
	threatcare: 'Threatcare',
	threatconnect: 'ThreatConnect',
	trackoff: 'TrackOFF',
	whiteops: 'White Ops'
};

const SECTION = /(?=<div data-fluid-engine="true">)/;
const BLOCK = /(?=<div[^>]*class="[^"]*\bfe-block\b)/;
const BLOCK_ID = /\bfe-block-([0-9a-f]+)/;
// a block's place: its mobile rule comes first, the desktop one after it
const AREA = /\.fe-block-([0-9a-f]+) \{\s*grid-area: (\d+)\/(\d+)\/(\d+)\/(\d+);/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const FILE = /<img\b[^>]*\bdata-src="([^"]+)"/;
const EXIT_SECTION = /\bexits?\b/i;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

// an address saved from an advert or a highlighted search result keeps its
// place and loses its tracking
function website(raw: string): string {
	const url = unescape(raw).replace(/#:~:text=.*$/, '');
	const [address, query] = url.split('?');
	if (!query) return url;
	const kept = query
		.split('&')
		.filter((param) => !/^(gclid|gbraid|wbraid|fbclid|msclkid|srsltid|gad_[a-z_]*|utm_[a-z]*)=/i.test(param));
	return kept.length > 0 ? `${address}?${kept.join('&')}` : address;
}

// "500x175_securitytrails.jpg" -> "securitytrails"
const fileKey = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/^\d+x\d+[_-]/, '')
		.toLowerCase();

interface Placed {
	image: boolean;
	text: string;
	link: string;
	file: string;
	rows: [number, number];
	columns: [number, number];
}

function areas(html: string): Map<string, number[]> {
	const found = new Map<string, number[]>();
	for (const [, id, ...lines] of html.matchAll(AREA)) found.set(id, lines.map(Number));
	return found;
}

function placed(section: string, where: Map<string, number[]>): Placed[] {
	return section
		.split(BLOCK)
		.slice(1)
		// a section's last block runs on into the page section after it
		.map((block) => block.split(/<section\b/)[0])
		.flatMap((block) => {
			const area = where.get(block.match(BLOCK_ID)?.[1] ?? '');
			if (!area) return [];
			const head = block.slice(0, 800);
			const image = /sqs-block-image/.test(head);
			if (!image && !/sqs-block-html/.test(head)) return [];
			return [
				{
					image,
					text: image ? '' : clean(block.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')),
					link: image ? website(block.match(LINK)?.[1] ?? '') : '',
					file: image ? (block.match(FILE)?.[1] ?? '') : '',
					rows: [area[0], area[2]] as [number, number],
					columns: [area[1], area[3]] as [number, number]
				}
			];
		});
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const where = areas(html);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(SECTION).slice(1)) {
		const blocks = placed(section, where);
		const texts = blocks.filter((b) => !b.image && b.text);
		const heading = [...texts].sort((a, b) => a.rows[0] - b.rows[0] || a.columns[0] - b.columns[0])[0];
		const exits = EXIT_SECTION.test(heading?.text ?? '');
		const field = (heading?.text ?? '').replace(/\s+companies$/i, '');

		for (const logo of blocks.filter((b) => b.image)) {
			// the label: the nearest text to its left sharing its row
			const label =
				texts
					.filter(
						(t) =>
							t !== heading &&
							t.rows[0] < logo.rows[1] &&
							logo.rows[0] < t.rows[1] &&
							t.columns[1] <= logo.columns[0]
					)
					.sort((a, b) => b.columns[1] - a.columns[1])[0]?.text ?? '';
			const key = fileKey(logo.file);
			const host = hostOf(logo.link);
			const name = exits
				? (EXITS[key] ?? (key ? key[0].toUpperCase() + key.slice(1) : ''))
				: (NAMES[host] ?? (host ? domainName(host) : ''));
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({
				name,
				category: exits
					? /^\d{4}$/.test(label)
						? `Exited ${label}`
						: 'Exited'
					: [tag(field), tag(label)].filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
				url: logo.link
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('gula: no logos in the portfolio grids — the layout moved');
	}

	return companies;
}
