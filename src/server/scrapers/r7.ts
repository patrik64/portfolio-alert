import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.r7.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the portfolio a run of hand-built rows on the fund's one
// page rather than a collection — so the classes are numbered per company
// (link-block-27, link-block-28) and cannot be matched on. the link is found
// by the word the fund puts inside it instead.
//
// a row gives the company's name, a line about it, the stage it is at, the
// year the fund came in, and a link to it. where a company has gone public or
// been bought, the fund adds a line in bold saying when and under what ticker,
// and that is kept after the stage.

const ITEM = '<h1 class="heading-25 newhead">';
const STAGE = /class="paragraph-8">([^<]*)</;
const NOTE = /class="paragraph-6">[\s\S]*?<strong>([^<]*)<\/strong>/;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*>\s*<p class="paragraph-11 linkweb">/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note written "Public 2021 (NASDAQ: LIDR)"
// keeps its commas folded rather than reading as several tags
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.slice(0, item.indexOf('</h1>')));
		if (!name || seen.has(name)) continue;
		seen.add(name);

		companies.push({
			name,
			category: [tag(item.match(STAGE)?.[1] ?? ''), tag(item.match(NOTE)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('r7: no companies on the portfolio page');
	}

	return companies;
}
