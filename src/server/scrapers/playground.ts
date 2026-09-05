import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.playground.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow with a finsweet filter, so the whole portfolio is on the page and
// the themes are a nested list on each card.
//
// the fund never writes a company's name in a field of its own: a card is a
// logo, a paragraph and a link. so the logo's file names the company, and
// where the paragraph beside it spells that same name the paragraph's spelling
// wins, since it has the capitalisation the file lost — "gigacrop" is GigaCrop
// and "d-matrix" is d-Matrix. a spelling with no capital in it is not the
// brand but the ordinary word, so de-ice is not named after the "deice" in its
// own sentence.
//
// the address only gets to correct the file when the two plainly agree, which
// is how the fund's own typo in "infinnimune" becomes Infinimmune. it must not
// do more than that: two companies here link to the firm that bought them, and
// Mosaic and Nervana Systems would otherwise be filed under Databricks and
// Intel. the fund records no exit anywhere, so none is recorded here either.

const ITEM = /class="portfolio-item w-dyn-item"/g;
const LOGO = /src="(https:\/\/cdn\.prod\.website-files\.com\/[^"]+)"[^>]*class="portfolio-logo"/;
const SITE = /href="(https?:\/\/[^"]*)"[^>]*class="button is-icon card-btn/;
const ABOUT = /class="portfolio-card-text">([^<]*)</;
const THEME = /fs-cmsfilter-field="category">([^<]*)</g;
// what a logo file is called besides the brand
const DRESSING = /\b(?:logos?|colou?rs?|black|white|primary|mark|wordmark|full|final)\b/gi;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a theme the fund wrote with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a name reduced to what it is made of, so the file, the address and the
// sentence can be compared without their spacing and capitals
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the brand as the logo file spells it
const fromLogo = (src: string) =>
	clean(
		decodeURIComponent(src.split('/').pop() ?? '')
			.replace(/^[0-9a-f]{16,}_/, '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/[_-]+/g, ' ')
			.replace(DRESSING, '')
			// webflow numbers a file it has seen before
			.replace(/\b\d+\b\s*$/, '')
	);

// the same name as the fund's own sentence spells it, if it is in there and
// written as a name rather than as an ordinary word
const spelledOut = (name: string, about: string) => {
	const letters = key(name);
	if (letters.length < 3) return '';
	const pattern = [...letters].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-.]?');
	const found = about.match(new RegExp(pattern, 'i'))?.[0].trim() ?? '';
	return /[A-Z]/.test(found) ? found : '';
};

// whether a file and an address are two spellings of one company rather than a
// company and the firm that bought it
const sameCompany = (a: string, b: string) => {
	if (a.startsWith(b) || b.startsWith(a)) return true;
	let shared = 0;
	while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
	return shared >= 4;
};

const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const starts = [...html.matchAll(ITEM)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const item = html.slice(at, starts[i + 1] ?? html.length);

		const url = item.match(SITE)?.[1] ?? '';
		const about = clean(item.match(ABOUT)?.[1] ?? '');
		const logo = fromLogo(item.match(LOGO)?.[1] ?? '');

		let name = spelledOut(logo, about);
		if (!name && sameCompany(key(logo), key(host(url)))) {
			name = spelledOut(host(url), about);
		}
		if (!name) name = logo === logo.toLowerCase() ? clean(logo.replace(/\b[a-z]/g, (c) => c.toUpperCase())) : logo;
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...item.matchAll(THEME)].map((m) => tag(m[1])).filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('playground: no companies on the portfolio page');
	}

	return companies;
}
