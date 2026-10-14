import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.kaya.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page opens on a few featured companies, a card
// each with its picture, its name, a line about it and a link to its site,
// then lists the rest, a row each with its name, a badge for one the fund is
// out of ("Exited") or that has closed ("RIP"), a line about it ("Online
// grocery platform") and, for most, a link to its site; the featured
// companies are not listed again. the line is kept as a tag, an exit with
// the Exited tag and a company closed with the Closed tag.

const FEATURED =
	/<figure class="group"><a\b[^>]*\bhref="([^"]*)"[^>]*>[\s\S]*?<figcaption\b[^>]*><span class="block text-dark">([\s\S]*?)<\/span><span\b[^>]*>([\s\S]*?)<\/span><\/figcaption>/g;
const ROW = /(?=<li class="group relative\b)/;
const LINK = /^<li\b[^>]*>\s*<a href="([^"]*)"/;
const NAME = /<span class="font-serif text-xl\b[^"]*">([\s\S]*?)<\/span>/;
const BADGE = /<span class="inline-flex shrink-0\b[^"]*">([\s\S]*?)<\/span>/;
const LINE = /<span class="font-sans text-base\b[^"]*">([\s\S]*?)<\/span>/;
const EXITED = /^exited$/i;
const CLOSED = /^rip$/i;
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

const link = (href: string) => {
	const site = unescape(href).trim();
	return /^https?:\/\//i.test(site) ? site : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the featured cards and the list's rows, as name, line, badge and site
	const entries = [
		...[...html.matchAll(FEATURED)].map(([, href, name, line]) => ({ name, line, badge: '', href })),
		...html
			.split(ROW)
			.slice(1)
			.map((row) => ({
				name: row.match(NAME)?.[1] ?? '',
				line: row.match(LINE)?.[1] ?? '',
				badge: row.match(BADGE)?.[1] ?? '',
				href: row.match(LINK)?.[1] ?? ''
			}))
	];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const entry of entries) {
		const name = clean(entry.name);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = clean(entry.badge);
		const site = link(entry.href);
		if (site) withSite++;
		companies.push({
			name,
			category: [
				tag(entry.line),
				EXITED.test(badge) ? 'Exited' : CLOSED.test(badge) ? 'Closed' : tag(badge)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('kaya: no companies on the portfolio page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("kaya: no company links its site — the page's markup moved");
	}

	return companies;
}
