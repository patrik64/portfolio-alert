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

// the host turns away an address it has heard too much from with a 429, and
// production shares its addresses with strangers: some nights the one request
// this scraper makes is one too many. the refusal is waited out — for as long
// as the host asks, within reason — before the night is given up. a minute
// between tries was too little for some nights, so three are allowed, well
// inside the five minutes a fund gets; the tries alternate with the plain
// companies address, which serves the same list, in case the limit is kept
// per address rather than per caller
const RETRIES = 3;
const RETRY_DELAY_MS = 60_000;
const MAX_DELAY_MS = 75_000;
const ALTERNATE_URL = 'https://valorcapitalgroup.com/companies/';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(): Promise<Response> {
	let resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	for (let retry = 0; resp.status === 429 && retry < RETRIES; retry++) {
		// seconds when it is a number; a date, or nothing, gets the default
		const asked = Number(resp.headers.get('retry-after')) * 1000;
		await wait(Math.min(asked > 0 ? asked : RETRY_DELAY_MS, MAX_DELAY_MS));
		resp = await fetch(retry % 2 === 0 ? ALTERNATE_URL : PAGE_URL, { headers: { 'User-Agent': UA } });
	}
	return resp;
}

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#8217;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetchPage();
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
