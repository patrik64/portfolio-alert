import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.1414ventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, its repeater served in the html: a card per company with its logo, a line of
// what it does, or who bought it, and a button to its page on the site. the logos'
// alt text is whatever the file was called, so the name and the address come from
// that page, one request each for a dozen companies. a second, smaller repeater
// repeats the two sold ones without a button, and so is passed over.
const CARD = /(?=role="listitem" class="_FiCX")/;
const BUTTON = /\bhref="(https:\/\/www\.1414ventures\.com\/[a-z0-9-]+)"[^>]*aria-label="Learn/;
const LINE = /<p class="font_7[^>]*>([\s\S]*?)<\/p>/;
const TITLE = /<title[^>]*>([^<|]*)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOT_THE_COMPANY = /(?:1414ventures|linkedin|twitter|facebook|instagram|youtube|wix)\.com/i;
const BOUGHT = /^acquired by\s+(.+?)(?:\s*\([^)]*\))?$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

async function read(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const cards = (await read(PAGE_URL))
		.split(CARD)
		.slice(1)
		.flatMap((card) => {
			const page = card.match(BUTTON)?.[1];
			return page ? [{ page, line: clean(card.match(LINE)?.[1] ?? '') }] : [];
		});
	if (cards.length === 0) {
		throw new Error('1414: no companies on the portfolio page');
	}

	const companies = await Promise.all(
		cards.map(async ({ page, line }) => {
			const html = await read(page);
			const buyer = line.match(BOUGHT)?.[1];
			return {
				name: clean(html.match(TITLE)?.[1] ?? ''),
				// a comma separates the fund's own sectors here, so they stay apart
				category: buyer ? `Acquired by ${buyer.replace(/\s*,\s*/g, ' / ')}, Exited` : line.replace(/,\s+and\s+/g, ', '),
				url: [...html.matchAll(LINK)].map(([, href]) => href).find((href) => !NOT_THE_COMPANY.test(href)) ?? ''
			};
		})
	);

	return companies.filter(({ name }) => name);
}
