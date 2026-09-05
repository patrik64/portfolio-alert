import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.maveron.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the portfolio is two groups under their own headings, the ones the
// fund still holds and its notable exits, and each row hides a panel behind it
// holding the company's address, who at the fund backed it and, where there is
// one, a line on how it ended: Acquired by Picnic Health, 2023. NASDAQ: BIRD.
//
// that line is kept in place of the heading wherever a row has one, since it
// says the more of the two; the ten exits without one keep the fund's word for
// the group instead. seven companies it still holds have such a line as well —
// a listing rather than an ending — and those are kept too.
//
// a row writes the company's name in one of two elements depending on which
// group it is in, so either will do, and both say the same thing.
//
// the fund leaves a zero-width joiner in the panel where it has nothing to
// say, which reads as a line until it is taken out.
//
// the sector is in fields the fund hides for its own filter to read. every row
// carries All alongside the real one, which is the filter's way of saying no
// filter rather than anything about the company.

const GROUP = /<h2 class="portfolio-group-header">([\s\S]*?)<\/h2>/g;
const ROW = /<div[^>]*role="listitem" class="exit-hover-item w-dyn-item">([\s\S]*?)(?=<div[^>]*role="listitem" class="exit-hover-item w-dyn-item">|<\/div><\/div><\/div>)/g;
const NAME = /class="portfolio-group-item(?:-copy)?">([\s\S]*?)<\/div>/;
const SECTOR = /fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const PARAGRAPH = /<p>([\s\S]*?)<\/p>/g;
const SITE = /<strong>\s*Website\s*<\/strong>[\s\S]{0,200}?<a[^>]*\bhref="([^"]*)"/;
const ANCHOR = /<a href="(https?:\/\/[^"]*)"[^>]*class="notable-exit-item/;
// the paragraphs that label the panel's own fields rather than say anything
const LABELLED = /^(?:website|investors)/i;
// the filter's word for no filter at all
const EVERYTHING = /^all$/i;
// the group the fund keeps a company in once it has gone
const GONE = /exit/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		// the zero-width characters the fund leaves in an empty line
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const groups = [...html.matchAll(GROUP)].map((group) => ({
		at: group.index,
		said: clean(group[1])
	}));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.matchAll(ROW)) {
		const inside = row[1];
		const name = clean(inside.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const said = [...inside.matchAll(PARAGRAPH)]
			.map((paragraph) => clean(paragraph[1]))
			.find((paragraph) => paragraph && !LABELLED.test(paragraph));
		const group = groups.filter((one) => one.at < row.index).at(-1)?.said ?? '';
		const site = inside.match(SITE)?.[1] ?? inside.match(ANCHOR)?.[1] ?? '';

		companies.push({
			name,
			category: [
				...new Set(
					[...inside.matchAll(SECTOR)]
						.map((sector) => clean(sector[1]))
						.filter((sector) => sector && !EVERYTHING.test(sector))
				),
				said || (GONE.test(group) ? group : '')
			]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('maveron: no companies in the portfolio groups');
	}

	return companies;
}
