import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.lererhippeau.com/portfolio';
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, paginated the way northzone's is: the "next" link is followed
// until the site stops offering one, and a featured list repeats on every
// page, so the pages overlap and every company is kept once. each card names
// the company in its "Visit ..." link, links to the company's own address,
// and says since when the fund has been in — its sector exists only as a
// filter checkbox, unattached to any card, so it cannot be read.

const ITEM = '<div role="listitem" class="portfolio-collection-item';
const NAME = /<div class="website-url">Visit<\/div>\s*<div class="website-url">([^<]*)<\/div>/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="link-holder/;
const SINCE = /SINCE<\/div>\s*<div[^>]*>(\d{4})</;
const NEXT = /href="(\?[a-z0-9]+_page=\d+)"[^>]*class="w-pagination-next/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let next: string | null = PAGE_URL;

	for (let page = 0; next && page < MAX_PAGES; page++) {
		const html: string = await fetchPage(next);
		let found = 0;
		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name) continue;
			found++;
			if (seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			// the year the fund came in, which SINCE labels on every card
			companies.push({
				name,
				category: item.match(SINCE)?.[1] ?? '',
				url: item.match(SITE)?.[1] ?? ''
			});
		}
		if (found === 0) {
			throw new Error(`lererhippeau: ${next} listed no companies`);
		}
		const query = html.match(NEXT)?.[1];
		next = query ? `${PAGE_URL}${query}` : null;
	}
	if (next) {
		throw new Error(`lererhippeau: the portfolio still paginated after ${MAX_PAGES} pages`);
	}
	if (companies.length === 0) {
		throw new Error('lererhippeau: no companies in the portfolio');
	}

	return companies;
}
