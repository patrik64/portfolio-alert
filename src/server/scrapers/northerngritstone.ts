import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.northern-gritstone.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the whole portfolio served. the fund splits it into three
// sections under their own headings, and each section is a list that keeps its
// companies in the context attribute the page hands its own script — the name,
// a line about what the company does, and a Visit button carrying the address.
// so the headings and the contexts are walked together in the order the page
// puts them, and a list belongs to the heading last seen above it.
//
// the fund types those headings inconsistently — LIFE SCIENCES beside
// health-tech — but draws every one of them in capitals, so the casing it
// typed is not something a reader ever sees. the words are given the capitals
// they read with rather than the ones they were stored with.
//
// the fund records nothing else about a company: no stage, no place, and no
// mark for one that has gone.

const SECTION = /<h4[^>]*>([\s\S]*?)<\/h4>|data-current-context="([^"]*userItems[^"]*)"/g;

interface Item {
	title?: string;
	button?: { buttonLink?: string };
}

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

// the category is comma-joined, so a heading written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// what the heading reads as, whatever it was typed as
const titled = (s: string) =>
	s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let section = '';

	for (const [, heading, context] of html.matchAll(SECTION)) {
		if (heading !== undefined) {
			section = titled(tag(heading));
			continue;
		}

		let items: Item[];
		try {
			items = (JSON.parse(un(context)) as { userItems?: Item[] }).userItems ?? [];
		} catch {
			continue;
		}

		for (const item of items) {
			const name = clean(item.title ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({
				name,
				category: section,
				url: clean(item.button?.buttonLink ?? '')
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('northerngritstone: no companies in the portfolio');
	}

	return companies;
}
