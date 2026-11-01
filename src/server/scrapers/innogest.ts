import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.innogestcapital.com';
// the fund's two portfolios, a page each; a company in both is on both pages
const PAGES = ['/healthcare/portfolio-healthcare/', '/technology/portfolio-digital/'];
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress and a theme's portfolio grid: a card per company with its logo, a
// line about it and its site, the portfolios it belongs to in the card's classes
// and a stamp, /img/exit.png, on the ones the fund is out of. the name is only in
// the logo, whose alt text is empty, so the companies are named from a list looked
// up once, keyed by the post id on the card: the fund's own spelling on its /tag/
// pages, or the logo for the ones without a page. one missing from it is named
// after its address, or its logo's file where it has none, until it is added.
const NAMES: Record<string, string> = {
	170: 'Atricath',
	195: 'IGEA',
	197: 'EryDel',
	199: 'Angiodroid',
	203: 'Hacking Team',
	205: 'Beintoo',
	207: 'Agroils',
	209: '40South Energy',
	213: 'DrexCode',
	215: 'THRON',
	221: 'mBooster',
	467: 'SingularID',
	469: 'Mobango',
	471: 'Silicon Biosystems',
	473: 'TheBlogTV',
	750: 'Pi-Cardia',
	1093: 'Prestiamoci',
	1268: 'Newronika',
	1523: 'Sardex',
	2220: 'BetaGlue Technologies',
	2249: 'CV Lab',
	// the fund's "Anaconda", which alone reads as the python company
	2341: 'Anaconda Biomed',
	2747: 'Digital Magics',
	2801: 'Diet to Go',
	3064: 'Medlumics',
	3176: 'Empatica',
	3594: 'GreenBone',
	// the fund's tag says SoulKitchen, its logo and the company's address soul-k
	4801: 'Soul-K',
	5146: 'MioAssicuratore',
	6292: 'Renovacor',
	6901: 'Affera'
};

const CARD = /(?=<div class="portfolio-item\b)/;
const ID = /\bdata-id="(\d+)"/;
const CLASSES = /class="portfolio-item portfolio-item-custom ([^"]*)"/;
const LAYOUT_CLASS = /^v\d+$/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*>\s*View Website\s*<\/a>/;
const LOGO = /<img src="[^"]*\/uploads\/[^"]*\/([^"/]+)\.\w+"/;
const LOGO_SIZE = /[-_]\d+(?:x\d+)?$/;
const EXIT_STAMP = '/img/exit.png';

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "hello-bio" -> "Hello Bio"
const titled = (s: string) => s.split(/[-_]/).filter(Boolean).map(capitalize).join(' ');

function nameOf(id: string, site: string, logo: string): string {
	if (NAMES[id]) return NAMES[id];
	if (site) return titled(new URL(site).hostname.replace(/^www\./, '').split('.')[0]);
	return titled(logo.replace(LOGO_SIZE, ''));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const path of PAGES) {
		const pageUrl = `${BASE_URL}${path}`;
		const resp = await fetch(pageUrl, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${pageUrl}: ${resp.status}`);
		}
		const cards = (await resp.text()).split(CARD).slice(1);
		// one portfolio's list must not pass for the fund's whole
		if (cards.length === 0) {
			throw new Error(`innogest: no companies on ${pageUrl}`);
		}
		for (const card of cards) {
			const id = card.match(ID)?.[1] ?? '';
			const site = card.match(SITE)?.[1] ?? '';
			const name = nameOf(id, site, card.match(LOGO)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const portfolios = (card.match(CLASSES)?.[1] ?? '')
				.split(/\s+/)
				.filter((c) => c && !LAYOUT_CLASS.test(c))
				.map(capitalize);
			companies.push({
				name,
				category: [...portfolios, card.includes(EXIT_STAMP) ? 'Exited' : ''].filter(Boolean).join(', '),
				url: site
			});
		}
	}

	return companies;
}
