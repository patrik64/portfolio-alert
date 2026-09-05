import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://propellervc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// hubspot cms. the portfolio is one list: a row per company holding its name,
// a line about what it does, the sector the fund files it under and the round
// it came in at.
//
// a row links to the fund's own "meet the company" post rather than to the
// company, and it is those posts that carry the address — each links out
// exactly once, to the company itself. they are fetched in batches.
//
// six of the twenty-five rows are called "Stealth" and are written as plain
// divs rather than links, having no post behind them. six companies cannot all
// be filed under that one name, so they are left out until the fund says who
// they are; the markup tells them apart without having to match on the word.

const ROW = /<a class="propeller-list-row[^"]*" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /propeller-list-row__title">([^<]*)</;
const TAG = /propeller-list-row__tag">([^<]*)</g;
const LINK = /href="(https?:\/\/[^"]+)"/g;
// the fund's own pages, hubspot's plumbing, the asset hosts a page pulls from,
// and where everyone posts
const NOT_THE_COMPANY =
	/propellervc|hs-sites|hubspot|hsforms|hscollectedforms|w3\.org|google|gstatic|fonts|fontawesome|jsdelivr|cdnjs|unpkg|cloudfront|facebook|twitter|x\.com|linkedin|instagram|youtube|vimeo|schema\.org/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = (await fetchText(PAGE_URL)).replace(/\s+/g, ' ');

	const listed: { name: string; category: string; post: string }[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ROW)) {
		const name = clean(m[2].match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({
			name,
			category: [...m[2].matchAll(TAG)].map((t) => clean(t[1])).filter(Boolean).join(', '),
			post: clean(m[1])
		});
	}

	if (listed.length === 0) {
		throw new Error('propeller: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const posts = await Promise.all(
			batch.map((c) => (c.post ? fetchText(c.post).catch(() => '') : ''))
		);
		batch.forEach((c, j) => {
			companies.push({
				name: c.name,
				category: c.category,
				url:
					[...posts[j].matchAll(LINK)].map((m) => m[1]).find((u) => !NOT_THE_COMPANY.test(u)) ?? ''
			});
		});
	}

	return companies;
}
