import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.dip-capital.com/theportfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: a card per company with its logo, linked to its site where it has one, a
// line under it ("Funded: 2022", "Exit: M&A – Cazoo", "Nasdaq Listed") and three
// labels: sector, status and country. the name is only in the logo, whose alt text
// is empty, and two have no address, so the companies are named from a list looked
// up once, keyed by the logo's file, whose id stays when the card is edited. one
// missing from it is named after its address until it is added. Hero links to its
// buyer, Klarna.
const NAMES: Record<string, string> = {
	'5c0517a375885392fe085539': 'Wejo',
	'5ddff1d23dc8f2c03f89b7e1': 'Hero',
	'5ddff1e6a73badc4405ca3ee': 'Acatus',
	'5e3953faac6af4139432c5d3': 'Adludio',
	'5fd747871e560ba9d9c8044b': 'Brumbrum',
	'5fd76ac5718dbb08eef0fff1': 'Everli',
	'615c26b8d9d3ed3dcaff0d10': 'Nuri',
	'6241a361a58295944453e493': 'Heroes',
	'639f12fa84d8d45d758d923c': 'Refurbed',
	'639f1a62a4494180a2ab9e4b': 'LandVault'
};

const CARD = /(?=class="mix w-dyn-item")/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const LOGO = /<img\b[^>]*\bsrc="[^"]*\/([0-9a-f]{24})_[^"]*"/;
const BLURB = /class="portfolioinvestmentblurb">([^<]*)/;
const LABEL = /class="categ">([^<]*)/g;
const FUNDED = /^funded:\s*(\d{4})$/i;
const BOUGHT = /^exit:\s*m&a\s*[–-]\s*(.+)$/i;
const LIVE = /^live$/i;
const EXITED = /^exited$/i;

const clean = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#0?39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (url: string) =>
	new URL(url).hostname
		.replace(/^www\./, '')
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
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const href = card.match(LINK)?.[1] ?? '';
		const url = /^https?:\/\//.test(href) ? href : '';
		const name = NAMES[card.match(LOGO)?.[1] ?? ''] ?? (url ? nameFrom(url) : '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const blurb = clean(card.match(BLURB)?.[1] ?? '');
		const labels = [...card.matchAll(LABEL)].map(([, label]) => tag(label));
		const buyer = blurb.match(BOUGHT)?.[1];
		companies.push({
			name,
			category: [
				...labels.filter((label) => !LIVE.test(label) && !EXITED.test(label)),
				blurb.match(FUNDED)?.[1] ?? '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				!buyer && !FUNDED.test(blurb) ? tag(blurb) : '',
				labels.some((label) => EXITED.test(label)) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('dip: no companies on the portfolio page');
	}

	return companies;
}
