import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.s2ginvestments.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft cms with sprig filters, which also answer to plain query parameters,
// so the fund's own filters do the work: the bare page lists every company,
// ?sector= gives the three it files them under, and ?status=exit the ones it
// has left.
//
// each card names the company in its link, sometimes wrapping the leading
// digits in a span of their own — "<span>38</span> Degrees North" — and the
// list is rendered twice, once as a grid and once as a list, so every company
// appears twice.
//
// the cards and the write-ups behind them carry no company address, so none is
// recorded.

const SECTORS: Record<string, string> = {
	energy: 'Energy',
	'food-and-agriculture': 'Food & Agriculture',
	oceans: 'Oceans'
};
const EXIT_QUERY = 'status=exit';

const ITEM = /href="https:\/\/www\.s2ginvestments\.com\/companies\/([^"]+)">\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/a>/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the slugs a filtered page lists
function slugsIn(html: string): Set<string> {
	const slugs = new Set<string>();
	for (const m of html.matchAll(ITEM)) slugs.add(m[1]);
	return slugs;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const sectorKeys = Object.keys(SECTORS);
	const [all, exited, ...sectorPages] = await Promise.all([
		fetchText(PAGE_URL),
		fetchText(`${PAGE_URL}?${EXIT_QUERY}`).catch(() => ''),
		...sectorKeys.map((s) => fetchText(`${PAGE_URL}?sector=${s}`).catch(() => ''))
	]);

	const exitedSlugs = slugsIn(exited);
	const sectorsOf = new Map<string, string[]>();
	sectorPages.forEach((html, i) => {
		for (const slug of slugsIn(html)) {
			const held = sectorsOf.get(slug) ?? [];
			held.push(SECTORS[sectorKeys[i]]);
			sectorsOf.set(slug, held);
		}
	});

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of all.matchAll(ITEM)) {
		const slug = m[1];
		const name = clean(m[2]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...(sectorsOf.get(slug) ?? []), exitedSlugs.has(slug) ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('s2g: no companies on the portfolio page');
	}

	return companies;
}
