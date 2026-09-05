import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.norrsken.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// webflow, the whole portfolio served — no paging. a row names the company and
// carries the three things the fund files it under, each written into the row
// as the field its filters sort on: the country, the sector, and the round it
// came in at.
//
// a row links to the fund's page for the company rather than to the company,
// and the address is printed there behind a Website button, so those pages are
// read too. one company has no button and keeps the fund's page.
//
// the fund writes its rounds as it pleases — a Seed beside twenty seeds, a
// series A beside a seed A — and the page prints them exactly as typed, so
// that is a thing a reader sees and they are left alone. the exception is the
// six it has exited: the round is where it says so, writing "exited" over
// whatever the round was, and that one word is recorded as Exited the way
// every other fund's is.
//
// the year the fund came in is on the row too. a year is not a name to file a
// company under, so it is left out.

const ITEM = 'class="sort-item w-dyn-item"';
const NAME = /class="portfolio-item-title"><h2>([\s\S]*?)<\/h2>/;
const PATH = /<a href="(\/portfolio\/[^"]+)"/;
const FIELD = (key: string) => new RegExp(`fs-list-field="${key}"[^>]*>([\\s\\S]*?)</p>`);
// the button the fund puts on a company's page, and only there
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="cta-big[^"]*"/;
// what the fund writes in the round when there is no longer a round
const EXITED = /^exited$/i;

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

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchSite(path: string): Promise<string> {
	const url = `${BASE_URL}${path}`;
	try {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return url;
		return clean((await resp.text()).match(SITE)?.[1] ?? '') || url;
	} catch {
		return url;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const found: { name: string; category: string; path: string }[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		const path = item.match(PATH)?.[1] ?? '';
		if (!name || !path || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const round = tag(item.match(FIELD('Funding stage'))?.[1] ?? '');
		found.push({
			name,
			category: [
				tag(item.match(FIELD('Country'))?.[1] ?? ''),
				tag(item.match(FIELD('Sector'))?.[1] ?? ''),
				EXITED.test(round) ? 'Exited' : round
			]
				.filter(Boolean)
				.join(', '),
			path
		});
	}
	if (found.length === 0) {
		throw new Error('norrsken: no companies in the portfolio');
	}

	const companies: ScrapedCompany[] = [];
	for (let start = 0; start < found.length; start += BATCH_SIZE) {
		const batch = found.slice(start, start + BATCH_SIZE);
		const sites = await Promise.all(batch.map((entry) => fetchSite(entry.path)));
		batch.forEach((entry, index) => {
			companies.push({ name: entry.name, category: entry.category, url: sites[index] });
		});
	}

	return companies;
}
