import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://pebblebed.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, rendered on the server, the portfolio a table: one row per company
// with its name, a link, a line saying what it builds, its founders and the
// year it was founded. no filters and nothing to page through.
//
// the fund files its companies under no sector, and the line it writes is a
// phrase rather than a sentence — "VMware for GPUs", "Memory infrastructure
// for AI agents" — so that is what the category is.

const ROW = /<span class="truncate">/g;
const NAME = /^<span class="truncate">([^<]*)<\/span>/;
const SITE = /<a aria-label="[^"]*" class="[^"]*" href="(https?:\/\/[^"]*)"/;
const ABOUT = /<span class="block min-w-0 lg:col-span-3">([^<]*)</;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a line the fund wrote with a comma in it
// would read as several tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const starts = [...html.matchAll(ROW)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const row = html.slice(at, starts[i + 1] ?? html.length);

		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: tag(row.match(ABOUT)?.[1] ?? ''),
			url: row.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('pebblebed: no companies on the portfolio page');
	}

	return companies;
}
