import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://socialleverage.com/portfolio/';
const DATA_URL = 'https://socialleverage.com/data/portfolio.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page renders empty card skeletons and fills them from a json file the
// site serves itself, which is where the hundred and one companies are — name,
// address, sector, stage, and whether the company has exited.
//
// that file writes its sectors and stages as slugs, so the page's own filter
// buttons are read for the labels it shows them under: "saas" is SaaS, "vertical
// ai" is Vertical AI, "series-c" is Series C+.
//
// the site also has an /api/companies endpoint, but it is a jobs board feed and
// carries only the twenty-eight companies that are hiring.

const FILTER = /<button[^>]*class="filter-btn[^"]*"[^>]*data-filter="([^"]*)"[^>]*>([^<]*)<\/button>/g;
const EXITED = /^exited$/i;
// the fund's vehicles, which say nothing about a company
const VEHICLE = /^(all|active|fund-[ivx]+|slaf)$/i;

interface Company {
	name?: string;
	url?: string;
	status?: string;
	stage?: string | null;
	industry?: string[] | null;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// a slug the buttons do not label reads as its own words
const titleCase = (s: string) => s.replace(/[a-z0-9]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, data] = await Promise.all([fetchText(PAGE_URL), fetchText(DATA_URL)]);

	const labels = new Map<string, string>();
	for (const m of html.matchAll(FILTER)) {
		const slug = m[1].toLowerCase();
		if (!VEHICLE.test(slug) && !labels.has(slug)) labels.set(slug, clean(m[2]));
	}
	const label = (slug: string) => labels.get(slug.toLowerCase()) ?? titleCase(slug);

	const rows: Company[] = JSON.parse(data)?.companies ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.name ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				...(row.industry ?? []).map((i) => label(i)),
				row.stage ? label(row.stage) : '',
				EXITED.test(row.status ?? '') ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: row.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('socialleverage: no companies in the portfolio data');
	}

	return companies;
}
