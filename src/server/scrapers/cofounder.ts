import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cofounder.pl/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// one page, its portfolio a slider of logos near the end, under the words "Selected
// Team members' Investments through CofounderZone Corporate Angel Fund ASI and ASI
// Corvus Ventures". a tile links the company's site, with a line of what it does on
// hover, the only label the page gives, and a buyer in brackets on the one sold. the
// logos have no alt text, so the companies are named from a list looked up once, read
// off the logos and keyed by the address; one missing from it is named after its
// address until it is added.
const NAMES: Record<string, string> = {
	'3ngage.se': '3ngage',
	'adtonos.com': 'AdTonos',
	'aleet.co': 'Aleet',
	'altera.co': 'Altera',
	'amberlo.io': 'Amberlo',
	'auxiliuspharma.com': 'Auxilius Pharma',
	'carein.pl': 'Carein',
	'ecobean.pl': 'Ecobean',
	'edualy.com': 'Edualy',
	'ekobilet.pl': 'Ekobilet',
	'epinote.io': 'Epinote',
	'foodsi.pl': 'Foodsi',
	'fyrtel.market': 'Fyrtel',
	'locketconnect.com': 'Locket',
	'mentorist.app': 'Mentorist',
	'miesnapaczka.pl': 'Mięsna Paczka',
	'milluu.com': 'Milluu',
	'nethansa.com': 'Nethansa',
	'openquiz.pl': 'Open Quiz',
	'portal.sqarplan.com': 'Sqar Plan',
	'proteinrise.com': 'Proteinrise',
	'silkplm.com': 'Silk PLM',
	'smartlunch.com': 'Lunching',
	'sonarhome.pl': 'SonarHome',
	'sunroof.se': 'Sunroof',
	'zeme.com.pl': 'Zeme'
};

const TILE =
	/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="portfolio__link portfolio-hover"[^>]*>[\s\S]*?class="portfolio-hover__desc"[^>]*>([\s\S]*?)<\/p>/g;
const BOUGHT = /\s*\(acquired by\s+([^)]*?)\s*(?:S\.A\.)?\)\s*$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ').trim();

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
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, line] of html.matchAll(TILE)) {
		const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		const name = NAMES[host] ?? nameFrom(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const words = clean(line);
		const buyer = words.match(BOUGHT)?.[1];
		companies.push({
			name,
			category: [
				tag(words.replace(BOUGHT, '')),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('cofounder: no companies on the page');
	}

	return companies;
}
