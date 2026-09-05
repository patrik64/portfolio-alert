import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.outsidersfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow with finsweet filtering over it, so the whole portfolio is in the
// page and the browser only hides what a filter rules out. each card carries
// the name, what the fund files the company under, where it is, what round it
// is at, and the company's own site.
//
// the fund keeps the round and the exit in one field, so a company reads as
// Pre-Seed or Series B until it is Exited. that field goes last, which is
// where an exit belongs.
//
// the cards also carry the year the company was founded. it is a fact about
// the company rather than a tag it could be filed under, and it reads as
// nothing much in a list of tags, so it is left out.

const LIST = 'class="companies-list w-dyn-items"';
const CARD = /class="company"/g;
const NAME = /class="company__name">([\s\S]*?)<\/div>/;
const FIELD = (label: string) =>
	new RegExp(`class="company__info-title">${label}</p><p[^>]*class="company__info-text">([^<]*)<`);
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="company__link/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "San Francisco, CA" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the page carries two more collections above this one, holding the words
	// the filters are drawn with, so the portfolio is read from its own list on
	const at = html.indexOf(LIST);
	if (at === -1) {
		throw new Error('outsiders: no portfolio list on the page');
	}
	const list = html.slice(at);

	const starts = [...list.matchAll(CARD)].map((m) => m.index);
	if (starts.length === 0) {
		throw new Error('outsiders: no companies in the portfolio list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, start] of starts.entries()) {
		const card = list.slice(start, starts[i + 1] ?? list.length);

		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				tag(card.match(FIELD('Industry'))?.[1] ?? ''),
				tag(card.match(FIELD('Location'))?.[1] ?? ''),
				tag(card.match(FIELD('Status'))?.[1] ?? '')
			]
				.filter(Boolean)
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('outsiders: no companies behind the portfolio list');
	}

	return companies;
}
