import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.healthxventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, laid out in blocks. the companies held come as pairs: a logo
// block linking the company's site, and beside it — before or after — a text
// block naming the company under a heading and saying what it does; a name is
// paired with the logo next to it. under an "Exits" heading the companies the
// fund is out of are logos alone, many linking to the buyer rather than the
// company (wellbe's to orbita, veda's to h1), with no name written anywhere.
// those are named from a list looked up once, keyed by the address each exit
// links to; an exit missing from it takes the name its image file gives, or
// its address's, until it is added.
const EXIT_NAMES: Record<string, string> = {
	'evidence.care': 'Agathos',
	'amopportunities.org': 'AMOpportunities',
	'caresignal.health': 'CareSignal',
	'outcomes4me.com': 'Geno.me',
	'healthipass.com': 'Health iPASS',
	'kilterrewards.com': 'Kilter',
	'narrativedx.com': 'NarrativeDx',
	'avasure.com': 'Nurse Disrupted',
	'thinkpacifica.com': 'Pacifica',
	'rxlightning.com': 'RxLightning',
	'h1.co': 'Veda',
	'orbita.ai': 'WellBe'
};

const BLOCK = /(?=<div[^>]*class="[^"]*\bfe-block\b)/;
const EXITS = /<h1[^>]*>\s*Exits\s*<\/h1>/i;
const NAME = /<h4[^>]*>([\s\S]*?)<\/h4>/;
const LINK = /<a[^>]*href="(https?:\/\/[^"]+)"/;
const FILE = /data-src="([^"]+)"/;
const IS_IMAGE = /sqs-block-image|image-block/;
// a file named for nothing in particular ("Picture1.png", "image-asset.png")
const UNINFORMATIVE = /^(image-asset|picture\d*|logo|img[\s_-]?\d*|[0-9a-f]{12,}.*)$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

const titled = (s: string) =>
	s
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "Health+iPASS+New+Logo.png" -> "Health iPASS"
function fileName(src: string): string {
	const file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/\+/g, ' ')
		.replace(/\b(new|logo|\d{4})\b/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return !file || UNINFORMATIVE.test(file) ? '' : file;
}

interface Block {
	name: string;
	link: string;
	src: string;
	image: boolean;
}

function read(block: string): Block {
	return {
		name: clean(block.match(NAME)?.[1] ?? ''),
		link: block.match(LINK)?.[1] ?? '',
		src: block.match(FILE)?.[1] ?? '',
		image: IS_IMAGE.test(block.slice(0, 600))
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const split = html.search(EXITS);
	if (split < 0) {
		throw new Error('healthx: the portfolio page has no exits heading — the layout moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string, url: string) => {
		if (!name || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({ name, category, url });
	};

	// the companies held: each name with the logo next to it
	const held = html.slice(0, split).split(BLOCK).slice(1).map(read);
	const paired = new Set<number>();
	held.forEach((block, i) => {
		if (!block.name || block.image) return;
		const logo = [i - 1, i + 1].find(
			(j) => held[j]?.image && held[j].link && !paired.has(j) && !held[j].name
		);
		if (logo !== undefined) paired.add(logo);
		add(block.name, '', logo !== undefined ? held[logo].link : '');
	});

	// the exits: logos up to the first block that says something
	for (const block of html.slice(split).split(BLOCK).slice(1).map(read)) {
		if (!block.image) {
			if (block.name || !block.link) break;
			continue;
		}
		if (!block.link) continue;
		const host = hostOf(block.link);
		const name = EXIT_NAMES[host] ?? (fileName(block.src) || titled(host.split('.')[0] ?? ''));
		add(name, 'Exited', block.link);
	}

	if (companies.length === 0) {
		throw new Error('healthx: no companies on the portfolio page');
	}

	return companies;
}
