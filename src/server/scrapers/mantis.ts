import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.mantisvc.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 6;

// webflow. the portfolio page is a carousel per category, each under its own
// heading, and every company has its name and its address written into the
// slide. some carousels hold each of their companies twice over, which is how
// a loop is made to look endless, so the same name arriving again is the same
// company rather than another one.
//
// a carousel does not always hold everything its category has: the
// acquisitions one shows seventeen of eighteen. so the fund's page for each
// category is read as well and the two are put together, which also means a
// carousel quietly shrinking would not take companies with it. the categories
// are the headings on the page, and their addresses are those headings written
// as the fund writes them in a url.
//
// Acquisitions is one of those categories, and is what the fund says about a
// company that has gone; it is kept in that word.

const HEADING = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
const ITEM = /<div[^>]*class="portfolio-div">([\s\S]*?)(?=<div[^>]*class="portfolio-div">|$)/g;
const NAME = /class="portfolio-company-name">([\s\S]*?)<\/div>/;
const SITE = /<a[^>]*\bhref="([^"]*)"[^>]*class="portfolio-link-block-about/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the fund's own address for a category is its name with the spaces and the
// slash between AI and ML turned into hyphens
const slug = (said: string) =>
	said
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const headings = [...html.matchAll(HEADING)]
		.map((heading) => ({ at: heading.index, said: clean(heading[1]) }))
		.filter((heading) => heading.said);
	if (headings.length === 0) {
		throw new Error('mantis: the portfolio page names no categories');
	}

	const found = new Map<string, { categories: string[]; url: string }>();
	const note = (name: string, category: string, url: string) => {
		const company = found.get(name) ?? { categories: [], url: '' };
		if (category && !company.categories.includes(category)) company.categories.push(category);
		if (url && !company.url) company.url = url;
		found.set(name, company);
	};

	const read = (source: string, category?: string) => {
		for (const item of source.matchAll(ITEM)) {
			const name = clean(item[1].match(NAME)?.[1] ?? '');
			if (!name) continue;
			const under =
				category ?? headings.filter((heading) => heading.at < item.index).at(-1)?.said ?? '';
			note(name, under, item[1].match(SITE)?.[1] ?? '');
		}
	};

	read(html);

	// the page the fund keeps for each category, which holds all of it
	for (let at = 0; at < headings.length; at += BATCH_SIZE) {
		const batch = headings.slice(at, at + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((heading) => fetchText(`${BASE_URL}/portfolio-categories/${slug(heading.said)}`))
		);
		batch.forEach((heading, index) => read(pages[index], heading.said));
	}

	const companies: ScrapedCompany[] = [];
	for (const [name, company] of found) {
		companies.push({
			name,
			category: company.categories.join(', '),
			url: /^https?:\/\//i.test(company.url) ? company.url : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('mantis: no companies in the portfolio');
	}

	return companies;
}
