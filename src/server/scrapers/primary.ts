import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.primary.vc';
const PORTFOLIO_URL = `${BASE_URL}/portfolio/by-investor`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 20;

// webflow with a paginated collection, twenty-five companies to the page. a
// row carries a logo, a line about the company, its founders, the sector the
// fund files it under, the stage it is at and a link to the company — but not
// its name, which the fund only prints on the company's own page. so the rows
// are read first and the names fetched from those pages in batches.
//
// the stage doubles as how the investment ended: most rows say Seed or Series
// A, nine say Exited and one says IPO. those belong after the sector, which is
// where the stage already sits.
//
// two companies have their name left blank in the fund's cms, so their page
// comes back with an empty title. the slug the fund filed them under names
// them instead, then the logo file, then the address they link to — the first
// of those not already taken. the order matters: the fund holds two companies
// branded Lantern, and the one whose name it left blank is at lanternhq.com,
// so it takes its slug while the named one keeps Lantern.
//
// a name the fund actually prints always claims its spelling first, so the two
// can never trade names between runs.

const ITEM = /class="companies_cms_item w-dyn-item"/g;
const PATH = /href="(\/companies\/[^"]+)"/;
const LOGO = /class="companies_row_logo"><img[^>]*src="([^"]+)"/;
const SITE =
	/<a target="" href="(https?:\/\/[^"]+)" class="clickable_link[^"]*"><span class="clickable_text u-sr-only">Visit Website/;
const TAG = /class="tags_cms_item w-dyn-item"><div class="u-text-style-small">([^<]*)</g;
const STAGE =
	/<div class="u-text-style-small u-weight-bold">Stage<\/div><div class="u-text-style-small">([^<]*)</;
const NEXT = /<a href="\?([^"]+)"[^>]*class="[^"]*w-pagination-next/;
const TITLE = /<title>([^<]*)<\/title>/;
// what a logo file is called besides the brand
const DRESSING = /\b(?:logos?|logotype|mark|wordmark|primary|full|colou?r|black|white)\b/gi;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector the fund wrote as "Fintech &
// Enterprise AI" stays one tag and a stage never splits into two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the brand as the fund's own logo file spells it, for the rows where it left
// the name blank
const fromLogo = (src: string) => {
	const file = decodeURIComponent(src.split('/').pop() ?? '')
		.replace(/\.[a-z0-9]+$/i, '')
		// webflow prefixes an upload with its own id
		.replace(/^[0-9a-f]{16,}_/, '')
		.replace(/[_-]+/g, ' ');
	return clean(file.replace(DRESSING, '').replace(/\(\d+\)/g, ''));
};

// the words of the slug the fund filed a company under
const fromSlug = (path: string) =>
	clean(path.split('/').pop() ?? '')
		.replace(/-+/g, ' ')
		.replace(/\b[a-z]/g, (c) => c.toUpperCase());

const fromHost = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
};

async function fetchName(path: string): Promise<string> {
	const resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
	if (!resp.ok) return '';
	return clean((await resp.text()).match(TITLE)?.[1] ?? '');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	type Entry = { path: string; url: string; logo: string; category: string };
	const entries: Entry[] = [];
	const seenPaths = new Set<string>();

	let url = PORTFOLIO_URL;
	for (let page = 0; page < 40; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		let added = 0;
		const starts = [...html.matchAll(ITEM)].map((m) => m.index);
		for (const [i, at] of starts.entries()) {
			const item = html.slice(at, starts[i + 1] ?? html.length);
			const path = item.match(PATH)?.[1];
			if (!path || seenPaths.has(path)) continue;
			seenPaths.add(path);
			added++;

			const tags = [...item.matchAll(TAG)].map((m) => tag(m[1]));
			entries.push({
				path,
				url: item.match(SITE)?.[1] ?? '',
				logo: item.match(LOGO)?.[1] ?? '',
				category: [...tags, tag(item.match(STAGE)?.[1] ?? '')].filter(Boolean).join(', ')
			});
		}

		const next = html.match(NEXT);
		if (!next || added === 0) break;
		url = `${PORTFOLIO_URL}?${next[1].replace(/&amp;/g, '&')}`;
	}

	// the names live one page deeper, so they are fetched a batch at a time
	const names = new Map<string, string>();
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const found = await Promise.all(
			batch.map(async (e) => ({ path: e.path, name: await fetchName(e.path) }))
		);
		for (const f of found) names.set(f.path, f.name);
	}

	// the companies the fund named go first, so a blank one can only fall back
	// to a spelling the named ones have left free
	const named = entries.filter((e) => names.get(e.path));
	const blank = entries.filter((e) => !names.get(e.path));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of [...named, ...blank]) {
		const url = entry.url || `${BASE_URL}${entry.path}`;

		let name = names.get(entry.path) ?? '';
		if (!name) {
			for (const candidate of [fromSlug(entry.path), fromLogo(entry.logo), fromHost(url)]) {
				if (candidate && !seen.has(candidate.toLowerCase())) {
					name = candidate;
					break;
				}
			}
		}
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: entry.category, url });
	}

	if (companies.length === 0) {
		throw new Error('primary: no companies on the portfolio page');
	}

	return companies;
}
