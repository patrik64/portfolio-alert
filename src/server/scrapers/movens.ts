import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://movenscapital.com/our-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a list of companies, the whole of it in
// the page, a row each opening on its name, its sector ("Healthtech Voice
// AI"), the quarter the fund came in ("Q3 2020") and a link to its site,
// and marked for the page's filters with its state ("Active", "Exited")
// and the fund it sits in ("Fund 1", "Fund 2", "Legacy"). the sector, the
// fund and the year are kept as tags, an exit with the Exited tag. two
// names are written with a lowercase l for the capital i ("Al Clearing",
// for aiclearing.com), and are stored spelled right, so the page fixing
// them would not make them new.

const ROW = /<li class="portfolio-item"([^>]*)>([\s\S]*?)<\/li>/g;
const STATE = /\bdata-state="([^"]*)"/;
const FUNDS = /\bdata-filters="([^"]*)"/;
const NAME = /<h3 class="portfolio-title">([\s\S]*?)<\/h3>/;
const SECTOR = /<span class="sector-label">([\s\S]*?)<\/span>/;
const DATE = /<div class="date-label">([\s\S]*?)<\/div>/;
const SITE = /<a class="website-link-wrapper" href="([^"]*)"/;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exited$/i;
// a name as the page writes it, lowercased, and as it is stored
const STORED_AS: Record<string, string> = {
	'al clearing': 'AI Clearing',
	'sky engine al': 'Sky Engine AI'
};
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

// the funds a row is marked with: data-filters="[&quot;Fund 1&quot;]"
function fundsOf(attributes: string): string[] {
	try {
		const funds: unknown = JSON.parse(unescape(attributes.match(FUNDS)?.[1] ?? '[]'));
		return Array.isArray(funds) ? funds.map((fund) => tag(String(fund))) : [];
	} catch {
		return [];
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, attributes, row] of html.matchAll(ROW)) {
		const written = clean(row.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = clean(row.match(DATE)?.[1] ?? '').match(YEAR)?.[0];
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(row.match(SECTOR)?.[1] ?? ''),
				...fundsOf(attributes),
				year ? `Invested ${year}` : '',
				EXITED.test(clean(attributes.match(STATE)?.[1] ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('movens: no companies in the portfolio list — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("movens: no company links its site — the list's markup moved");
	}

	return companies;
}
