import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.spicecapital.xyz/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hand-written html. the book is grouped under eight sector headings, each
// company a button that opens a panel holding its address and a line about it.
//
// the exits are a separate list at the foot of the page, written as "Windsor
// (acquired by Front)". the acquirer moves into the category and out of the
// name, and those links go to the acquirer's announcement rather than to the
// company, so no address is recorded for them.

const MAIN = '<main';
const HEADING = /<h2>([^<]*)<\/h2>/g;
const ITEM = /<article class="portfolio-company">/g;
const NAME = /<button class="portfolio-company-button"[^>]*>([^<]*)<\/button>/;
const SITE = /<a class="portfolio-visit" href="([^"]*)"/;
const EXIT_LIST = /<div class="portfolio-exit-list">([\s\S]*?)<\/div>/;
const EXIT = /<a[^>]*>([^<]*)<\/a>/g;
const ACQUIRED = /\s*\((acquired by [^)]*)\)\s*$/i;
const ITEM_MAX = 1500;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const body = html.slice(html.indexOf(MAIN));

	const headings = [...body.matchAll(HEADING)].map((m) => ({ at: m.index, text: clean(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, category: string, url: string) => {
		if (!name || seen.has(name)) return;
		seen.add(name);
		companies.push({ name, category, url });
	};

	for (const m of body.matchAll(ITEM)) {
		const item = body.slice(m.index, m.index + ITEM_MAX);
		add(
			clean(item.match(NAME)?.[1] ?? ''),
			headings.filter((h) => h.at < m.index).pop()?.text ?? '',
			item.match(SITE)?.[1] ?? ''
		);
	}

	for (const m of (body.match(EXIT_LIST)?.[1] ?? '').matchAll(EXIT)) {
		const written = clean(m[1]);
		const acquirer = written.match(ACQUIRED)?.[1];
		add(written.replace(ACQUIRED, '').trim(), acquirer ? capitalize(acquirer) : 'Exited', '');
	}

	if (companies.length === 0) {
		throw new Error('spice: no companies on the portfolio page');
	}

	return companies;
}
