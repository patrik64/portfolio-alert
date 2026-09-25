import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.eastlinkcap.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with a page builder: the portfolio page is three sections, each
// headed with the fund that invested ("Fund II Core Investments", "Fund II
// Tracker Program", "Fund I Investments") and holding a banner per company
// — the name, a paragraph about it and a link to its site. a company held
// by both funds appears in both, and is kept once with both as tags. how a
// company went is written into its name — "Uber (IPO)" — and the name is
// cut there, the rest kept with the Exited tag.

const SECTION = /(?=<[^>]*class="uvc-main-heading)/;
const HEADING = /class="uvc-main-heading[^>]*>([\s\S]*?)<\/div>/;
const BANNER = /(?=<div[^>]*class="ult-banner-block)/;
const NAME = /class="[^"]*\bbb-top-title\b[^"]*"[^>]*>([\s\S]*?)<\/h\d>/;
const LINK = /class="bb-link"[^>]*\bhref="([^"]*)"/;
const OUTCOME = /\s*\(((?:acquired|exited|ipo|merged|public)\b[^)]*)\)\s*$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "Fund II Core Investments" as Fund II Core, "Fund I Investments" as Fund I
const fundOf = (heading: string) => tag(heading).replace(/\s+(investments|program)$/i, '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found = new Map<string, { name: string; tags: string[]; url: string }>();
	for (const section of html.split(SECTION).slice(1)) {
		const fund = fundOf(section.match(HEADING)?.[1] ?? '');
		for (const banner of section.split(BANNER).slice(1)) {
			const [name, outcome] = clean(banner.match(NAME)?.[1] ?? '')
				.match(new RegExp(`^([\\s\\S]*?)${OUTCOME.source}`, 'i'))
				?.slice(1) ?? [clean(banner.match(NAME)?.[1] ?? '')];
			if (!name || STEALTH.test(name)) continue;
			const known = found.get(name.toLowerCase());
			const tags = [fund, outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '', outcome ? 'Exited' : ''];
			if (known) known.tags.push(...tags);
			else found.set(name.toLowerCase(), { name, tags, url: unescape(banner.match(LINK)?.[1] ?? '').trim() });
		}
	}

	const companies: ScrapedCompany[] = [...found.values()].map(({ name, tags, url }) => ({
		name,
		category: tags.filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
		url: url || PAGE_URL
	}));

	if (companies.length === 0) {
		throw new Error('eastlink: no companies on the portfolio page');
	}

	return companies;
}
