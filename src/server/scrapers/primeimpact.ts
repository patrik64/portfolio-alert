import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.primeimpactfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, but the portfolio is laid out as image blocks on an ordinary
// page rather than a collection, so ?format=json returns a page with no items
// and the companies have to be read out of the html.
//
// each block is a card: the logo links to the company, the title holds its
// name and the subtitle a sentence about it. one block carries no title — it
// is the banner above the grid — and is skipped. squarespace renames the
// classes on these blocks now and then (october 2026 made an image block a
// "website-component-block … image-block" and its title "sqs-cdk-dynamic-text"),
// so a block is known by its "image-block" class wherever it sits in the
// list, and the title by its "image-title" class.
//
// the fund files its companies under nothing at all: no sectors, no filters,
// no exits section, and the sentence is prose rather than a tag. so the
// category is left empty rather than filled with a line that would only read
// as one long tag.

const BLOCK = /<div class="sqs-block\b[^"]*\bimage-block\b[^"]*"[^>]*id="block-[^"]+"/g;
const NAME = /class="image-title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /href="(https?:\/\/(?!definitions\.sqspcdn|[^"]*squarespace)[^"]+)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const starts = [...html.matchAll(BLOCK)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const block = html.slice(at, starts[i + 1] ?? html.length);

		const name = clean(block.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url: block.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('primeimpact: no companies on the portfolio page');
	}

	return companies;
}
