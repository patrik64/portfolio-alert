import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.nlc.health';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole portfolio served — a row a company, opening on a click to
// show what the fund keeps on it. everything is in the html whether or not a
// row is opened: the name, the domain the fund works in, where the company is,
// whether it still holds it, and a Visit website button.
//
// seven companies have no button and keep the fund's page for them instead.
//
// the fund writes a country with its flag in front — 🇳🇱 Netherlands — and the
// flag says only what the word after it already says, so it comes off. what is
// left is the country as every other fund here writes one.
//
// Active is what a company is while it is not the other thing, so it is
// dropped and only an exit is kept. three rows say nothing at all in that
// field and keep nothing.
//
// the page's title claims a hundred and more start-ups; the portfolio it
// serves is fifty-three, with nothing to page through and no more arriving on
// a scroll. the fifty-three are what the fund lists.

const ITEM = 'class="portfolio_collection-item w-dyn-item"';
const NAME = /class="text-style-subtitle">([\s\S]*?)<\/div>/;
const SITE = /<a [^>]*href="(https?:\/\/[^"]*)"[^>]*class="button is-link/;
const PATH = /<a href="(\/portfolio\/[^"]*)"/;
const FIELD = (key: string) => new RegExp(`fs-cmsfilter-field="${key}">([\\s\\S]*?)</div>`);
const DOMAIN = /fs-cmsfilter-field="domain">([\s\S]*?)<\/div>/g;
// what a company is while the fund still holds it
const HELD = /^active$/i;
// the flag the fund draws in front of a country, which the country then names
const FLAG = /[\u{1F1E6}-\u{1F1FF}]/gu;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a domain written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s.replace(FLAG, '')).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const status = tag(item.match(FIELD('status'))?.[1] ?? '');
		const path = item.match(PATH)?.[1] ?? '';
		companies.push({
			name,
			category: [
				...[...item.matchAll(DOMAIN)].map((match) => tag(match[1])),
				tag(item.match(FIELD('location'))?.[1] ?? ''),
				HELD.test(status) ? '' : status
			]
				.filter(Boolean)
				.join(', '),
			url: clean(item.match(SITE)?.[1] ?? '') || (path ? `${BASE_URL}${path}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('nlc: no companies in the portfolio');
	}

	return companies;
}
