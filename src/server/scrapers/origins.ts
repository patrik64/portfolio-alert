import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.origins.fund';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// webflow, the portfolio one cms list served whole — no filters, no paging.
// each card carries the name, the round the fund came in on, where the company
// sits, and a line about what it does.
//
// the card does not carry the company's own address, but the fund writes a
// page per company and prints it there, so the pages are read too. a page that
// cannot be reached leaves the company pointing at the fund's page for it,
// which is where the card points.
//
// webflow writes a card's every field whether or not it is filled and hides
// the empty ones, so "Exit in" sits on all 22 cards marked invisible and the
// fund has recorded no exit yet. an exit is still read from the card it is
// shown on, since that is where it will appear.
//
// three cards are called Stealth, for companies the fund has not announced.
// they share the one name, publish "#" where an address goes, and two of them
// share a description as well, so there is nothing to tell them apart and they
// are skipped the way unannounced companies are elsewhere.

const ITEM = /<div [^>]*class="portfolio-item[^"]*\bw-dyn-item\b[^"]*"/;
const NAME = /<h2 class="h4 _28px">([\s\S]*?)<\/h2>/;
const PAGE = /<a [^>]*href="(\/company\/[^"]+)"/;
// the round and the place, written as two lines with a comma drawn between
const ROUND = /<div class="div-round-location">([\s\S]*?)<\/div><\/div>/;
const EXIT = /class="tag-stage exit([^"]*)"/;
const SITE = /<a href="([^"]+)"[^>]*class="link-company-website/;
// what the fund calls a company it has not announced
const UNANNOUNCED = /^stealth\b/i;

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

// the category is comma-joined, so a place written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// the round and the place come back as lines with the drawn comma among them
const written = (block: string) =>
	un(block.replace(/<[^>]+>/g, '\n'))
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line && line !== ',');

async function fetchSite(path: string): Promise<string> {
	const url = `${BASE_URL}${path}`;
	try {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return url;
		const site = (await resp.text()).match(SITE)?.[1] ?? '';
		// the fund writes "#" where a company it has not announced would have
		// an address
		return /^https?:\/\//i.test(site) ? clean(site) : url;
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

	const items = html.split(ITEM).slice(1);
	if (items.length === 0) {
		throw new Error('origins: the portfolio is no longer written into the page');
	}

	const found: { name: string; category: string; path: string }[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		const path = item.match(PAGE)?.[1] ?? '';
		if (!name || !path || UNANNOUNCED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const exit = item.match(EXIT);
		const exited = exit !== null && !exit[1].includes('w-condition-invisible');
		found.push({
			name,
			category: [...written(item.match(ROUND)?.[1] ?? ''), exited ? 'Exited' : '']
				.filter(Boolean)
				.map(tag)
				.join(', '),
			path
		});
	}

	const companies: ScrapedCompany[] = [];
	for (let at = 0; at < found.length; at += BATCH_SIZE) {
		const batch = found.slice(at, at + BATCH_SIZE);
		const sites = await Promise.all(batch.map((entry) => fetchSite(entry.path)));
		batch.forEach((entry, index) => {
			companies.push({ name: entry.name, category: entry.category, url: sites[index] });
		});
	}

	if (companies.length === 0) {
		throw new Error('origins: no companies in the portfolio');
	}

	return companies;
}
