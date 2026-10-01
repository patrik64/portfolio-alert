import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.acecap.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, laid out on its fluid grid: the portfolio page is a section
// for each of the fund's fields ("AI & Machine Learning", "New
// Industrials"), kept as tags, each a heading over a grid of logos linking
// the companies' sites. the logos' alt text names some ("Supernormal Logo
// Image") and leaves most blank, so the names are kept here, keyed on the
// address a logo links, as the logos read; an address not listed here
// imports under its alt text, or failing that named after itself the way
// the other domain-named scrapers do it, until it is added. nothing marks
// an exit.
const NAMES: Record<string, string> = {
	'algolia.com': 'Algolia',
	'antaris.space': 'Antaris',
	'anysignal.com': 'AnySignal',
	'apoha.com': 'Apoha',
	'arctoris.com': 'Arctoris',
	'atomic.industries': 'Atomic Industries',
	'block.xyz': 'Block',
	'blockstream.com': 'Blockstream',
	'cargomatic.com': 'Cargomatic',
	'classpass.com': 'ClassPass',
	'codat.io': 'Codat',
	'corintis.com': 'Corintis',
	'deepset.ai': 'deepset',
	'diracinc.com': 'Dirac',
	'easypost.com': 'EasyPost',
	'ethos-space.com': 'Ethos Space',
	'flexe.com': 'Flexe',
	'flexport.com': 'Flexport',
	'formlabs.com': 'Formlabs',
	'gamejolt.com': 'Game Jolt',
	'grid.is': 'GRID',
	'griptape.ai': 'Griptape',
	'groq.com': 'Groq',
	'harbingermotors.com': 'Harbinger Motors',
	'harbrdata.com': 'Harbr',
	'hathora.dev': 'Hathora',
	'highspot.com': 'Highspot',
	'hyperscience.com': 'Hyperscience',
	'insempra.bio': 'Insempra',
	'intropic.io': 'Intropic',
	'jobox.ai': 'Jobox',
	'joinef.com': 'Entrepreneurs First',
	'labgeni.us': 'LabGenius',
	'leapfin.com': 'Leapfin',
	'lootlocker.com': 'LootLocker',
	'magma.com': 'Magma',
	'meow.co': 'Meow',
	'mtion.tv': 'mtion',
	'mytos.bio': 'Mytos',
	'nostos-genomics.com': 'Nostos Genomics',
	'onfido.com': 'Onfido',
	'opencare.com': 'Opencare',
	'pandas.com.co': 'Pandas',
	'picsellia.com': 'Picsellia',
	'pinterest.com': 'Pinterest',
	'portalone.com': 'Portal One',
	'provectusalgae.com': 'Provectus Algae',
	'radiantnuclear.com': 'Radiant Nuclear',
	'recroom.com': 'Rec Room',
	'redroverinteractive.com': 'Red Rover Interactive',
	'sanalabs.com': 'Sana Labs',
	'scriptic.com': 'Scriptic',
	'sfatherapeutics.com': 'SFA Therapeutics',
	'sloyd.ai': 'Sloyd',
	'spaero.bio': 'Spaero Bio',
	'stokespace.com': 'Stoke Space',
	'superside.com': 'Superside',
	'supernormal.com': 'Supernormal',
	'swave.io': 'Swave Photonics',
	'taktile.com': 'Taktile',
	'the7bridges.com': '7bridges',
	'tractable.ai': 'Tractable',
	'tray.io': 'Tray.io',
	'tulip.co': 'Tulip',
	'uthana.com': 'Uthana',
	'windupminds.com': 'Windup Minds',
	'wish.com': 'Wish',
	'zafrens.com': 'Zafrens'
};

const SECTION = /(?=<section\b[^>]*\bdata-section-id=)/;
const HEADING = /<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/;
const BLOCK = /(?=<div\b[^>]*\bclass="fe-block\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
// "Supernormal Logo Image" -> "Supernormal"
const ALT_NOISE = /\s+(?:logo\s+)?image(?:\s+logo)?$|\s+logo$/i;
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

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(SECTION).slice(1)) {
		const section = chunk.slice(0, chunk.indexOf('</section>') + 1 || undefined);
		const field = tag(section.match(HEADING)?.[2] ?? '');
		for (const block of section.split(BLOCK).slice(1)) {
			if (!block.includes('sqs-block-image')) continue;
			const site = unescape(block.match(LINK)?.[1] ?? '').trim();
			const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
			if (!host || host.endsWith('acecap.com')) continue;
			const alt = clean(block.match(ALT)?.[1] ?? '').replace(ALT_NOISE, '');
			const name = NAMES[host] ?? (alt || domainName(host));
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({ name, category: field, url: site });
		}
	}
	if (companies.length === 0) {
		throw new Error('acequia: no logos on the portfolio page');
	}

	return companies;
}
