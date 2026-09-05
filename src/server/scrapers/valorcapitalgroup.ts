import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://valorcapitalgroup.com/companies/?type=list&country=all';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress (custom theme): the page ships both views of the
// same 125 companies. the grid view is the one worth parsing — every card is a
// .companies-list__item.js-company-item carrying the name, the company site and
// the city as data attributes, so nothing has to be recovered from logo images.
// a liquidity event shows as a badge above the logo, worded "Exit", "IPO",
// "SPAC" or "DIRECT LISTING ON NASDAQ"; all four are normalised to the "Exited"
// tag and appended last. the list view below repeats the same companies in
// plain markup and is skipped.

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const grid = html.slice(html.indexOf('js-grid-view"'), html.indexOf('js-list-view"'));

	const companies: ScrapedCompany[] = [];
	for (const [, card] of grid.matchAll(
		/<div class="companies-list__item js-company-item"([\s\S]*?)<\/div>\s*<\/div>/g
	)) {
		const name = decode(card.match(/data-title="([^"]*)"/)?.[1] ?? '');
		if (!name) continue;
		const location = decode(card.match(/data-location="([^"]*)"/)?.[1] ?? '');
		const exited = /companies-list__item-tag">\s*[^<]/.test(card);
		let url = decode(card.match(/data-link="([^"]*)"/)?.[1] ?? '');
		if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
		companies.push({
			name,
			category: [location, exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('valorcapitalgroup: no companies on the page');
	}

	return companies;
}
