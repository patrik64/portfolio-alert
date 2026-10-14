import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.omnescapital.com/investments';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with vue: the investments page is a grid of logos, the whole of
// it in the page, a logo opening a panel with the company's name, its
// country, city and sector, the year the firm invested, the year it
// exited where it has, and its site. each logo is shown for the page's
// filters by the firm's lines of business it falls under ("Venture Capital
// & Growth", "Energy Transition Infrastructure", "Co-Investment"), which
// the filter names. the line of business, the sector, the place and the
// year are kept as tags, an exit with the Exited tag. the grid holds the
// firm's infrastructure holdings as well ("Eole Infrastructure 2"), listed
// like any other.

const ITEM = /(?=<div id="investment\d+" data-position=)/;
const NAME = /<h3 class="b-investment__title">([\s\S]*?)<\/h3>/;
const SHOWN = /v-if="isSelected\(\[([^\]]*)\]\)"/;
const EXPERTISE = /<select name="expertise"[^>]*>([\s\S]*?)<\/select>/;
const OPTION = /<option value="([^"]+)"[^>]*>([^<]*)</g;
const FACT = (label: string) =>
	new RegExp(`<span>${label}</span>\\s*<span>([\\s\\S]*?)</span>\\s*</div>`);
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const EXITED = /class="b-investments__item-exited"|<span>Date of exit<\/span>/;
const YEAR = /\b(?:19|20)\d{2}\b/;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the lines of business, by the key each logo is shown under
	const lines = new Map(
		[...(html.match(EXPERTISE)?.[1] ?? '').matchAll(OPTION)].map(([, key, label]) => [key, tag(label)])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fact = (label: string) => item.match(FACT(label))?.[1] ?? '';
		const shown = [...(item.match(SHOWN)?.[1] ?? '').matchAll(/'([^']*)'/g)].map(([, key]) => key);
		const year = clean(fact('Investment Date')).match(YEAR)?.[0];
		const site = unescape(fact('Website').match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...shown.map((key) => lines.get(key) ?? ''),
				tag(fact('Sector')),
				tag(fact('City')),
				tag(fact('Country')),
				year ? `Invested ${year}` : '',
				EXITED.test(item) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('omnes: no companies on the investments page — the markup moved');
	}

	return companies;
}
