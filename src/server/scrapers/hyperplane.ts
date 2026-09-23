import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.hyperplane.vc';
const PAGE_URL = `${BASE_URL}/companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the companies page opens on a handful of featured cards — the
// newest investments, each naming the round the fund took part in — and
// then a table of the complete portfolio that leaves them out: a row per
// company with its name, the fund's tags for it, the stage it came in at,
// and how it stands, "Growth" or "Acquired by Zillow". both are read, the
// table first. the site links no company to its own address — the pages it
// keeps for them carry placeholders — so a company links to its page here.

const ROW = /(?=<div class="table_row">)/;
// the list runs to where its last tag, that tag's item and the list itself
// all close
const TAGS = /<div[^>]*class="[^"]*is-tags-list[^"]*"[^>]*>([\s\S]*?<\/div>)<\/div><\/div>/;
const CELL = /<div[^>]*class="table_cell"[^>]*>[\s\S]*$/;
const TEXT = /class="table_text">([\s\S]*?)<\/div>/g;
const PAGE = /href="(\/companies\/[^"#?]+)"/;
const CARD = /(?=<a href="\/companies\/[^"]+" class="card is-company)/;
const TITLE = /class="card_title is-company-name">([\s\S]*?)<\/h3>/;
const ROUND = /class="tag_text">([\s\S]*?)<\/div>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string[], page: string | undefined) => {
		if (!name || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: category.filter(Boolean).join(', '),
			url: page ? `${BASE_URL}${page}` : ''
		});
	};

	for (const row of html.split(ROW).slice(1)) {
		// with the tags and the closing description taken out, the row's own
		// texts are its name, its stage and its status, in that order
		const tags = [...(row.match(TAGS)?.[1] ?? '').matchAll(TEXT)].map((m) => tag(m[1]));
		const [name = '', stage = '', status = ''] = [
			...row.replace(TAGS, '').replace(CELL, '').matchAll(TEXT)
		].map((m) => clean(m[1]));
		add(
			name,
			[...tags, tag(stage), /^growth$/i.test(status) ? '' : tag(status), /acquired/i.test(status) ? 'Exited' : ''],
			row.match(PAGE)?.[1]
		);
	}

	for (const card of html.split(CARD).slice(1)) {
		add(clean(card.match(TITLE)?.[1] ?? ''), [tag(card.match(ROUND)?.[1] ?? '')], card.match(PAGE)?.[1]);
	}

	if (companies.length === 0) {
		throw new Error('hyperplane: no companies on the companies page');
	}

	return companies;
}
