import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.cleocap.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio is a wall of logos, most linking the
// company's site, and its tabs — "Deep tech", "Consumer", "Enterprise",
// "Exited", "AI", "Fintech" — are pages of their own, each a wall of the
// logos filed there. the "All" page leaves out a few that the others show,
// so every page is read, and a company takes the label of each page it is
// on; the "Exited" page marks the ones the fund is out of.
//
// not a name is written: the logos carry no alt text. a logo is known by
// its file, named after the company, typos and all ("grop+background+2",
// "Cmaeo+background"), and the same logo links one site on one page and
// none or another on the next — so the names are kept here by file, as
// the companies call themselves. a file not listed here is named after the
// site its logo links, the way the other domain-named scrapers do it,
// until it is added; one linking nowhere is left out.
const LOGOS: Record<string, string> = {
	'agora+back': 'Agora',
	'alto+background': 'Alto',
	'Angstrom+ai+back': 'Angstrom AI',
	aptos: 'Aptos Orbital',
	'archive+back': 'Archive',
	'athena+back': 'Athena Security',
	'atob+back': 'AtoB',
	'Auradine+back_': 'Auradine',
	'bizewise+back': 'Bizwise',
	'bloc+power+back': 'BlocPower',
	'bodeswell+baack': 'BodesWell',
	'breinifiy+back': 'Breinify',
	'brigit+background': 'Brigit',
	'Cmaeo+background': 'Cameo',
	'collagerie-logo': 'Collagerie',
	'contraline+back': 'Contraline',
	'Cryptosat+back': 'Cryptosat',
	'daffy+back': 'Daffy',
	'dispatch+back': 'Dispatch Goods',
	'earning+back': 'EarnIn',
	'easy+expunctions': 'Easy Expunctions',
	'Eby+back': 'Eby',
	'ellevest+background': 'Ellevest',
	'falcon+background': 'FalconX',
	first: 'First',
	'forethought+background': 'Forethought',
	'gemini+background': 'Gemini',
	'Ghia+square': 'Ghia',
	'glowbar-removebg-preview': 'Glowbar',
	'glowtick+back': 'Glowstick',
	'greenfield+back': 'Greenfield Robotics',
	'grop+background+2': 'Groq',
	'hi+note+back': 'HiNote',
	'hill+house': 'Hill House Home',
	'iyo+back': 'iyO',
	'kobold+metals+background': 'KoBold Metals',
	'levels+background': 'Levels',
	lighter: 'Lighter',
	'live+tinted+back': 'Live Tinted',
	'love+back': 'Love Wellness',
	'Love+stories+background': 'LoveStoriesTV',
	'lunchclub+back': 'Lunchclub',
	'Luum+logo': 'Luum',
	'mill+back': 'Mill',
	mmhmm: 'mmhmm',
	'modern+background': 'Modern Treasury',
	'mster+class+background': 'MasterClass',
	'Nestment+back': 'Nestment',
	'omsom+back': 'Omsom',
	'one+more+game+background': 'One More Game',
	'onsemble+logo+back': 'Onsemble',
	'otherland+back': 'Otherland',
	'ourself+back': 'Ourself',
	'peoplehood+logo': 'Peoplehood',
	'Permut+background': 'Permut',
	'planet+forward+2': 'Planet FWD',
	platejoy: 'PlateJoy',
	'playbook+background': 'Playbook',
	'plug+logo': 'Plug',
	'pocketnest+back': 'Pocketnest',
	'pym+back': 'PYM',
	'ROH+BACK': 'ROH',
	'rootine+back': 'Rootine',
	'savvi+png': 'Savvi AI',
	'Screen_Shot_2025-01-02_at_14.36.23-removebg-preview': 'Iconic',
	'stack+back': 'Stack',
	'styleseat+background': 'StyleSeat',
	'swehl+back': 'Swehl',
	'talli+back': 'Talli',
	'tempus+ex+back+nuew': 'Tempus Ex',
	'velaura+cleo': 'Velaura',
	'yumi+bak': 'Yumi'
};

// the tabs: links to the pages of the portfolio, "/portfolio-deeptech"
const TAB = /<a\b[^>]*\bhref="(\/portfolio(?:-[\w-]+)?)"[^>]*>([\s\S]*?)<\/a>/g;
const BLOCK = /(?=<div class="fe-block )/;
const IMAGE = /<img\b[^>]*\b(?:data-src|src)="([^"]+)"/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my', 'shop', 'home'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|shop|home)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

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

// "…/kobold+metals+background.png?format=500w" -> "kobold+metals+background"
const fileOf = (src: string) => (src.split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.\w+$/, '');

// a link typed with rubbish before it, "https://\thttps://www.permut.com/"
const siteOf = (href: string) => unescape(href).trim().match(/https?:\/\/[^\s]+$/)?.[0] ?? '';

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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const main = await fetchText(PAGE_URL);
	const tabs = new Map<string, string>();
	for (const [, path, label] of main.matchAll(TAB)) {
		if (path !== '/portfolio' && clean(label)) tabs.set(path, tag(label));
	}

	type Listed = ScrapedCompany & { labels: string[]; exited: boolean };
	const companies = new Map<string, Listed>();
	const read = (html: string, label: string) => {
		for (const block of html.split(BLOCK).slice(1)) {
			if (!/\bsqs-block-image\b/.test(block)) continue;
			const src = block.match(IMAGE)?.[1];
			if (!src) continue;
			const site = siteOf(block.match(LINK)?.[1] ?? '');
			const host = hostOf(site);
			const name = LOGOS[fileOf(src)] ?? (host ? domainName(host) : '');
			if (!name || STEALTH.test(name)) continue;
			const key = name.toLowerCase();
			const company = companies.get(key) ?? { name, category: '', url: '', labels: [], exited: false };
			company.url ||= site;
			if (/^exited$/i.test(label)) company.exited = true;
			else if (label && !company.labels.includes(label)) company.labels.push(label);
			companies.set(key, company);
		}
	};

	read(main, '');
	for (const [path, label] of tabs) read(await fetchText(`${BASE_URL}${path}`), label);
	if (companies.size === 0) {
		throw new Error('cleo: no known logos on the portfolio pages');
	}

	return [...companies.values()].map(({ labels, exited, ...company }) => ({
		...company,
		category: [...labels, exited ? 'Exited' : ''].filter(Boolean).join(', '),
		url: company.url || PAGE_URL
	}));
}
