import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nyca.com/companies?sector=All&filter=All';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// react, served rendered: the whole list is in the html, one row a company,
// asked for with the fund's own filters set to All so that nothing is held
// back. the page counts itself in its heading, and the rows come to the same
// number.
//
// a row names the company twice over — once as the label on the thing it links
// with, once as the text beside the logo — and the label is read, since a
// company the fund publishes no address for is drawn without a link but keeps
// its label all the same. ten are drawn that way and keep no address.
//
// what the fund files a company under and how it has done are the same kind of
// thing here: both are buttons that filter the list, titled with what they
// filter by, so both are read as tags in the order the row puts them. a
// company can be several at once — Affirm is a Unicorn, an IPO and an Exit.
// Active is the absence of the others and says nothing they do not, so it is
// dropped.
//
// one row is the fund's placeholder for a company it has not announced. it is
// called Stealth mode and has no address, so it is skipped the way unannounced
// companies are elsewhere.

const ROW = /<li class="grid grid-cols-12[\s\S]*?<\/li>/g;
const NAME = /aria-label="([^"]*)"/;
const LINK = /<a href="([^"]+)"/;
const FILTER = /title="Filter by ([^"]*)"/g;
// the status a company has while it is none of the others
const HELD = /^active$/i;
// what the fund calls a company it has not announced
const UNANNOUNCED = /^stealth\b/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a theme written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const rows = html.match(ROW) ?? [];
	if (rows.length === 0) {
		throw new Error('nyca: the portfolio is no longer a list of rows');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || UNANNOUNCED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...row.matchAll(FILTER)]
				.map((match) => tag(match[1]))
				.filter((value) => value && !HELD.test(value))
				.join(', '),
			url: clean(row.match(LINK)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('nyca: no companies in the portfolio');
	}

	return companies;
}
