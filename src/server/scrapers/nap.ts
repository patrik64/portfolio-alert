import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://nap.vc/build/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro: the companies page is two tables of rows, the companies the fund
// holds and, under "Exits", those it is out of. a held company's row links
// its site and gives its industry ("Manufacturing") and its city and
// country ("Berlin, Germany"), a few adding how the fund came to hold it
// ("(via Aleph Alpha)"), which is not kept. an exit's row gives its industry
// and how it went ("Acquired by Cohere", "IPO at Frankfurt Stock
// Exchange"), the buyer kept with the Exited tag; it links nothing, so
// links the page. the industry, the city and the country are kept as tags.

const ROW = /(?=<div\s+class="portfolio-row")/;
const NAME = /<(a|span)\b[^>]*class="portfolio-name\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/;
const HREF = /^<a\b[^>]*\bhref="([^"]*)"/;
const ARROW = /<span class="portfolio-arrow">[\s\S]*?<\/span>/g;
const EXIT_NAME = /class="portfolio-name\b[^"]*\bportfolio-name-exit\b/;
const INDUSTRY = /<span class="portfolio-industry">([\s\S]*?)<\/span>/;
const LOCATION = /<span class="portfolio-location">([\s\S]*?)<\/span>/;
const OUTCOME = /<span class="portfolio-outcome">([\s\S]*?)<\/span>/;
const BUYER = /\bacquired by\s*<strong>([\s\S]*?)<\/strong>/i;
const IPO = /\bIPO\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;|&thinsp;/g, ' ')
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const named = row.match(NAME);
		const name = clean((named?.[2] ?? '').replace(ARROW, ''));
		if (!named || !name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = row.match(OUTCOME)?.[1] ?? '';
		const out = EXIT_NAME.test(row) || !!clean(outcome);
		const buyer = clean(outcome.match(BUYER)?.[1] ?? '');
		const site = unescape(named[0].match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(row.match(INDUSTRY)?.[1] ?? ''),
				// "Berlin, Germany" -> the city and the country, each a tag
				...clean(row.match(LOCATION)?.[1] ?? '').split(/\s*,\s*/),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				IPO.test(clean(outcome)) ? 'IPO' : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('nap: no companies on the companies page — the markup moved');
	}

	return companies;
}
