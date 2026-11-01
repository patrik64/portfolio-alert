import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://tk-partners.co/our-portfolio/';
const OWN_HOST = 'tk-partners.co';
// the host drops the connection of a client claiming to be chrome without being
// one, and answers one that gives its own name
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress and elementor on siteground: the portfolio page is a wall of logos,
// each linking the company's site, under a heading per sector and a last
// heading, "Exited". no name is written on the wall, and the logos can't stand
// in for one: several tiles carry another company's image and alt text, left
// from being copied. so the companies are named from a list looked up once,
// keyed by the address: the fund's own spelling on its /startup/ pages, or the
// company's site for the three that have no such page. one missing from it is
// named after its address until it is added.
//
// a /startup/ page also gives the stage and the year the fund came in, but
// siteground meets a burst of requests with its captcha, and this one page is
// all the list needs. Asperitas has a /startup/ page and no tile, so it is not
// read.
const NAMES: Record<string, string> = {
	'ackcio.com': 'Ackcio',
	'acurionhealth.com': 'Acurion',
	'adra.ai': 'Adravision',
	'advancednanotherapies.com': 'Advanced Nano therapies',
	'advancemicrogrids.com': 'Advanced Microgrid Solutions',
	'agrimomo.com': 'Agrimomo',
	'alicetechnologies.com': 'ALICE Technologies',
	'arcfusion.ai': 'ArcFusion',
	'bloom.express': 'Bloom',
	'drinksipgood.com': 'SIPGOOD',
	'everai.ai': 'EverAI',
	'flylabfeed.com': 'Flylab',
	'globalbugs.asia': 'Global Bugs',
	'heartio.ai': 'Heart.io',
	'hyd-gen.com': 'HYDGEN',
	'hydroneo.net': 'HydroNeo',
	'identicalimplant.com': 'Identical',
	'invitrocue.com': 'Invitrocue',
	'lightyx.com': 'LightYX',
	'limitless.my': 'Limitless Technology',
	'nephrogenbiotech.com': 'Nephrogen',
	'oncoustics.com': 'Oncoustics',
	'osseolabs.com': 'Osseolabs',
	'propertyscout.co.th': 'Property Scout',
	'radiogenesis.ai': 'Radiogenesis',
	'rclabs.co': 'RC Labs',
	// the tile links the first, the company's /startup/ page the second
	'saiyoksprings.radach.com': 'Saiyok Springs',
	'saiyoksprings.com': 'Saiyok Springs',
	'siamseaplane.com': 'Siam Seaplane',
	'sonalasense.com': 'Sonalasense',
	'venavitals.com': 'Vena Vitals',
	'vflowtech.com': 'VFlowTech',
	'vistimlabs.com': 'Vistim Labs',
	'welala.co': 'Welala'
};

const SECTION = '>Our Portfolio</h2>';
const TOKEN = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*<img\b/g;
const EXITED = /^exited$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (host: string) =>
	host
		.split('.')[0]
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const section = (await resp.text()).split(SECTION)[1];
	if (!section) {
		throw new Error('tkpartners: the portfolio section moved');
	}

	// a company under two headings, a sector and "Exited", is one company
	const tiles = new Map<string, { url: string; tags: string[] }>();
	let heading = '';
	for (const [, title, href] of section.matchAll(TOKEN)) {
		if (title !== undefined) {
			heading = clean(title);
			continue;
		}
		const url = href.trim();
		const host = hostOf(url);
		if (host === OWN_HOST) continue;
		const tile = tiles.get(host) ?? { url, tags: [] };
		tile.tags.push(tag(heading));
		tiles.set(host, tile);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [host, { url, tags }] of tiles) {
		const name = NAMES[host] ?? nameFrom(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...tags.filter((t) => !EXITED.test(t)), tags.some((t) => EXITED.test(t)) ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('tkpartners: no companies on the portfolio page');
	}

	return companies;
}
