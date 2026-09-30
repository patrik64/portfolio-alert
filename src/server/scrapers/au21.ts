import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://au21.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a gallery of logos under "Selected
// Portfolio:", each a screenshot of the company's logo, linking nowhere
// and named nowhere, the alt text being the screenshot's file name
// ("Screen Shot 2020-10-13 at 6.52.41 PM.png"). so the names are kept here
// by the images' ids, as the logos read; two logos are marks only,
// BENQI's "Qi" and Decentral Games' "DG", named for the projects they
// stand for. a logo not listed here is left out until it is added.
// nothing marks an exit.
const LOGOS: Record<string, string> = {
	'5a7c13a424a69414064b2809': 'Binance',
	'5a7c13a471c10b9941f15e83': 'Huobi',
	'5a7c13a7e2c483d427b20072': 'OKEx',
	'5f2b6ff93a89d62dcaf04fd3': 'Polkadot',
	'5f2b701b91594641300b02c4': 'MobileCoin',
	'5f2b702ae49b126a34b28f2a': 'Harmony',
	'5f2b702d2769d9679f94e879': 'Marlin Protocol',
	'5f2b7243a774f36a1a59fd61': 'IoTeX',
	'5f2b730be49b126a34b2f52f': 'Injective Protocol',
	'5f865ada161d340f1e1c4357': 'The Graph',
	'5f865af9fca7701efa6dbc2a': 'Persistence',
	'5f865b082b71be35fbc7cb7b': 'Covalent',
	'5fab0ace7f7c907f12a83f79': 'Synthetix',
	'60008df97be0ad30147e98a9': 'Plasm',
	'60008e0984242d20cf98d6fc': 'Sovryn',
	'600ba04000b5600e9bc3c800': 'Axie Infinity',
	'600ba0644955200b5b037dde': 'Manta Network',
	'600ba06f676f651941f1bc95': 'Centrifuge',
	'60b749a893d11c66edf471ec': 'Polygon',
	'60b74c5e69bac30831bb6c98': 'Linear',
	'6168a3d545148f18ed0aed62': 'Avalanche',
	'6168a3d578b334344072b183': 'Republic',
	'6168a3d73ac72b30bcb35aa3': 'NEAR',
	'6168a3d8c657280a8ad38482': 'Helium',
	'6168a3da4978e73e95277aec': 'Equilibrium',
	'6168a3db48d6b87db743c8dd': 'Agoric',
	'6168a3dbb167fd5cc5199587': 'Chia',
	'6168a3deda1fb31bfe727c74': 'BENQI',
	'6168a3e04978e73e95277d36': 'Decentral Games',
	'6168a3e0dc9c783daef45b0b': 'deBridge',
	'618007a3fdde793c31050e71': 'Arcana',
	'618007a5a1a6482c68911cef': 'Flow'
};

const IMAGE = /<img\b[^>]*\bclass="thumb-image"[^>]*>/g;
const IMAGE_ID = /\bdata-image-id="([^"]*)"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [image] of html.matchAll(IMAGE)) {
		const name = LOGOS[image.match(IMAGE_ID)?.[1] ?? ''] ?? '';
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('au21: no known logos in the gallery');
	}

	return companies;
}
