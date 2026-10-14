import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://kindredcapital.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, rendered on the server: the portfolio page is a table, a row a
// company, giving its name, a link to its site, its status ("Active",
// "Inactive", "Exited"), its sectors ("Health and Bio", "Compute Stack")
// and the date the fund first backed it, under "First Believers Since".
// the page draws the table once per screen size, so the rows are
// deduplicated by name; an invisible list of the companies' slugs and
// sectors kept beside the table for the filters is not read, as it is not
// what the page shows. the sectors and the year are kept as tags, an exit
// with the Exited tag and a company no longer active with the Closed tag.

// a row: the container framer gives each of the table's entries
const ROW = /(?=<div class="framer-[\w-]+-container" id="[\w-]+-[a-z0-9]+">)/;
const NAME = /data-framer-name="Name"[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/;
const SITE = /data-framer-name="Link Wrapper"[^>]*\bhref="([^"]*)"/;
const TEXT = /<p dir="auto" class="framer-text"[^>]*>([\s\S]*?)<\/p>/g;
const SINCE = /<time datetime="((?:19|20)\d{2})-/;
const STATUS = /^(?:active|inactive|exited)$/i;
const EXITED = /^exited$/i;
const INACTIVE = /^inactive$/i;
const YEAR = /^(?:19|20)\d{2}$/;
const TRACKING = /^(?:utm_|hsa_|gad_|gclid$|gbraid$|wbraid$|fbclid$|msclkid$)/i;
const UNSAID = /^(?:-|\/|other|others|all|n\/a)$/i;
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

// the address without an advert's tracking, or nothing when it is no address
function siteOf(href: string): string {
	try {
		const url = new URL(unescape(href).trim());
		if (!/^https?:$/.test(url.protocol)) return '';
		for (const key of [...url.searchParams.keys()]) {
			if (TRACKING.test(key)) url.searchParams.delete(key);
		}
		return url.href;
	} catch {
		return '';
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
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the row's lines: the name, the status, the sectors with a "/"
		// between them, and the year
		const lines = [...row.matchAll(TEXT)].map(([, text]) => clean(text));
		const at = lines.findIndex((line) => STATUS.test(line));
		const status = at < 0 ? '' : lines[at];
		const end = lines.findIndex((line, i) => i > at && YEAR.test(line));
		const sectors = at < 0 ? [] : lines.slice(at + 1, end < 0 ? undefined : end).map(tag);
		const since = row.match(SINCE)?.[1];
		// the link wraps the row ahead of its name; past the name, the last
		// row runs on into the rest of the page
		const link = row.slice(0, row.search(NAME)).match(SITE)?.[1] ?? '';
		companies.push({
			name,
			category: [
				...sectors,
				since ? `Invested ${since}` : '',
				EXITED.test(status) ? 'Exited' : '',
				INACTIVE.test(status) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: siteOf(link) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('kindredcapital: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
