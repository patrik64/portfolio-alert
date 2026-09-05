import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.meron.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, one page, the portfolio written into it as a list of rows. thirteen
// companies the fund holds and nine it has exited, and the two are told apart
// by what closes the row: a number for one it holds, and for one it does not,
// where the company went — "→ Rubrik", "→ ServiceNow". that is the fund's own
// way of saying it and is kept as written; the numbers are counting rather
// than saying anything, and go.
//
// a company it still holds has its name in a link to the fund's own page for
// it, and one it has exited has the same name in a plain span. so the name is
// taken from the element that holds it either way, which is the one the fund
// stretches across the row.
//
// six of the nine exits have no address left to link to, their sites having
// gone with them, and they keep none.

const ROW = /<div[^>]*class="group [^"]*flex items-center[^"]*"[\s\S]*?<\/div>/g;
// the fund stretches a company's name across the row, linked or not
const NAME = /class="flex-1 min-w-0 truncate[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*aria-label="Visit /;
// what closes a row: the fund's count, or where the company went
const CLOSING = /<span class="font-mono[^"]*">([\s\S]*?)<\/span>/g;
// a row the fund is only numbering
const COUNTING = /^\d+$/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [row] of html.matchAll(ROW)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const closing = [...row.matchAll(CLOSING)].map((said) => clean(said[1])).at(-1) ?? '';
		companies.push({
			name,
			category: COUNTING.test(closing) ? '' : closing,
			url: row.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('meron: no companies in the portfolio list');
	}

	return companies;
}
