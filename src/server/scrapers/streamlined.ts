import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.streamlined.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js backed by contentful, and the whole list is server-rendered into the
// page's __NEXT_DATA__ — name, link and the sectors the fund files a company
// under. the page also holds a featured list, which is a subset of the same
// twenty-seven companies and adds nobody.
//
// two of the sectors are not sectors: "Acquired" and "IPO" record that a
// company has left, and are moved to the end of the list where the other
// scrapers put them. a company is occasionally tagged the same thing twice.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const EXIT = /^(acquired|ipo)$/i;

interface Company {
	title?: string;
	link?: string;
	categories?: { title?: string }[] | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const payload = html.match(NEXT_DATA)?.[1];
	if (!payload) {
		throw new Error('streamlined: __NEXT_DATA__ payload not found');
	}
	const list: Company[] = JSON.parse(payload)?.props?.pageProps?.companies ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of list) {
		const name = clean(entry.title ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags = [...new Set((entry.categories ?? []).map((c) => clean(c?.title ?? '')))].filter(
			Boolean
		);
		companies.push({
			name,
			category: [
				...tags.filter((t) => !EXIT.test(t)),
				...tags.filter((t) => EXIT.test(t)).map((t) => (/^ipo$/i.test(t) ? 'Exited' : t))
			].join(', '),
			url: entry.link ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('streamlined: no companies in the page payload');
	}

	return companies;
}
