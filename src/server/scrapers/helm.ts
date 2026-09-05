import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://thehelm.co/invest/our-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page holds two grids under their own headings —
// the companies the fund invested in, and the ones in its membership
// programme — and sixteen companies are in both, so they dedupe by name and
// keep the heading they were met under.
//
// the fund links no company to its own site: the page carries no outbound
// links at all, so each points at its page here. no sectors, no exit markers.


const NAME = /class="grid-item-name h4">\s*([^<]*?)\s*</;
const DETAIL = /<a href="(https?:\/\/thehelm\.co\/[^"]+)"/;
const HEADING = /<h[1-3][^>]*>\s*(Fund|Membership)\s*<\/h[1-3]>/g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const sections = [...html.matchAll(HEADING)].map((m) => ({ at: m.index, label: m[1] }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(/class="grid-item"/g)) {
		const item = html.slice(m.index, m.index + 3000);
		const name = (item.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: sections.filter((s) => s.at < m.index).pop()?.label ?? '',
			url: item.match(DETAIL)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('helm: no companies on the portfolio page');
	}

	return companies;
}
