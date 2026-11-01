import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://blackfin.com/tech-venture/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the venture page is a wall of logos, each linking the company's page on
// the site, which has its name, the fund, the year, the industry, the country and
// its address. the name is written in capitals on most, and "Crytpio" on one, so the
// ones that read badly are looked up by the page's address.
const NAMES: Record<string, string> = {
	agicap: 'Agicap',
	akur8: 'Akur8',
	crytpio: 'Cryptio',
	'descartes-underwriting': 'Descartes Underwriting',
	embankment: 'Embankment',
	'hawk-ai': 'Hawk AI',
	sinpex: 'Sinpex'
};

const PAGE = /href="(https:\/\/blackfin\.com\/projects-tech\/([^"/]+)\/)"/g;
const NAME = /<h1\b[^>]*>([\s\S]*?)<\/h1>/;
const FUND = /Fund\s*<span[^>]*>([^<]*)/;
const FIELD = /<h2\b[^>]*>\s*([^<]*?)\s*<\/h2>\s*<div class="info"[^>]*>([\s\S]*?)<\/div>/g;
const SITE_AREA = 'class="projects-site';
const SITE = /<a\b[^>]*\bhref="\s*(https?:\/\/[^"]*?)\s*"/;
const FIRST_YEAR = /\b(\d{4})\b/;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;|&#038;/g, '&')
		.replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function read(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const pages = new Map([...(await read(PAGE_URL)).matchAll(PAGE)].map(([, url, slug]) => [url, slug]));
	if (pages.size === 0) {
		throw new Error('blackfin: no companies on the venture page');
	}

	const details = await Promise.all(
		[...pages].map(async ([url, slug]) => {
			const html = await read(url);
			const fields = new Map([...html.matchAll(FIELD)].map(([, label, value]) => [label.toLowerCase(), value]));
			return {
				name: NAMES[slug] ?? clean(html.match(NAME)?.[1] ?? ''),
				category: [
					tag(fields.get('industry') ?? ''),
					tag(html.match(FUND)?.[1] ?? ''),
					fields.get('date')?.match(FIRST_YEAR)?.[1] ?? '',
					tag(fields.get('location') ?? '')
				]
					.filter(Boolean)
					.join(', '),
				url: (html.split(SITE_AREA)[1]?.match(SITE)?.[1] ?? '').split(/[?&]gad_source=|[?&]gclid=/)[0]
			};
		})
	);

	return details.filter(({ name }) => name);
}
