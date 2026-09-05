import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://m12.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// wordpress, with the portfolio in a jetengine grid the fund filters through
// its own query. the grid takes that query's name in the address, which is how
// the pages after the first are asked for, and how the fund's exited companies
// are asked for as well.
//
// a card carries the company on its face and, turned over, what the fund files
// it under and a button out to it. the fund's own case studies stand behind
// that button for three companies, and a page of the fund's is not a company's
// address, so those are left without one.
//
// the fund files a company by focus area and by stage. Early and Growth say
// when the fund came in rather than anything about the company and are left
// out; Exited is what became of it and is kept. the grid does not write the
// stage into a card, so the exited ones are asked for by that filter and
// matched by the id the fund gives each of them.
//
// the fund's own wording is kept as it stands, which is why Cybersecurity and
// Cyber Security, Deep Tech and AI and Deep Tech + AI all appear: that is how
// the fund has typed them.

const ITEM = /(?=<div class="jet-listing-grid__item )/;
const POST = /data-post-id="(\d+)"/;
const HEADING = /class="elementor-heading-title[^"]*">([\s\S]*?)<\/h\d>/g;
const BUTTON = /<a class="elementor-button[^"]*"[^>]*?\bhref="([^"]*)"/;
const STAGES = /data-query-var="stage"[\s\S]*?<\/select>/;
const QUERY_ID = /data-query-id="([^"]*)"/;
// the fund's markup breaks an attribute onto its own line
const OPTION = /<option\b[^>]*?\bvalue="([^"]*)"[^>]*?\bdata-label="([^"]*)"/g;
// the fund's word for a company it no longer holds
const GONE = 'Exited';
// a page of the fund's, which is not a company's address
const NOT_A_COMPANY = /^https?:\/\/(?:[a-z0-9-]+\.)*m12\.vc\b/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

const cards = (html: string) => html.split(ITEM).slice(1);
const idOf = (card: string) => card.match(POST)?.[1] ?? '';

export async function scrape(): Promise<ScrapedCompany[]> {
	const first = await fetchText(PAGE_URL);

	const stages = first.match(STAGES)?.[0];
	const query = stages?.match(QUERY_ID)?.[1];
	const exit = [...(stages ?? '').matchAll(OPTION)].find(
		(option) => clean(option[2]).toLowerCase() === GONE.toLowerCase()
	);
	if (!query || !exit) {
		throw new Error('m12: the portfolio no longer filters on a stage the fund has left');
	}
	const asked = (of: string) => `${PAGE_URL}?jsf=jet-engine:${query}&${of}`;

	const exited = new Set(cards(await fetchText(asked(`tax=stage:${exit[1]}`))).map(idOf));

	const pages = [first];
	for (let page = 2; page <= MAX_PAGES; page++) {
		const html = await fetchText(asked(`pagenum=${page}`));
		if (cards(html).length === 0) break;
		pages.push(html);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const html of pages) {
		for (const card of cards(html)) {
			// the company on the face of the card, and under it what it is filed as
			const said = [...card.matchAll(HEADING)].map((heading) => clean(heading[1])).filter(Boolean);
			const name = said[0];
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const url = clean(card.match(BUTTON)?.[1] ?? '');
			companies.push({
				name,
				category: [said[1] ?? '', exited.has(idOf(card)) ? GONE : ''].filter(Boolean).join(', '),
				url: /^https?:\/\//i.test(url) && !NOT_A_COMPANY.test(url) ? url : ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('m12: no companies in the portfolio');
	}

	return companies;
}
