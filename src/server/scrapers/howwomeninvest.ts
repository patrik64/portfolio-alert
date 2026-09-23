import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.howwomeninvest.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix. the portfolio page holds one repeater per fund, each under a heading
// ("our fund II portfolio"), and every item names a company, marks it
// "Exited" where it is, gives its sector, and links its site from a button.
// the fund is part of the category. a name can carry a note of another
// name — "Margin (a.k.a. Autaly)" — which is not part of it.

const ITEM = /role="listitem"/g;
const HEADING = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
const FUND = /fund\s+([ivx]+)\b/i;
// the item's text: its headings, then a bullet and the sector
const TEXT = /<h4[\s\S]*?<\/div>/;
const TITLE = /<h4[^>]*>([\s\S]*?)<\/h4>/g;
const LINE = /<p[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"/;
const ALIAS = /\s*\((?:a\.?k\.?a\.?|f\.?k\.?a\.?)\s[^)]*\)\s*/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[​ ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// the sectors are typed by hand, "FinTech" beside "Fintech"
const sector = (s: string) => clean(s).replace(/([a-z])Tech\b/g, '$1tech').replace(/\s*,\s*/g, ' / ');

// a link can carry the search engine's tracking tag it was copied with
function website(raw: string): string {
	const url = unescape(raw);
	const [address, query] = url.split('?');
	if (!query) return url;
	const kept = query
		.split('&')
		.filter((param) => !/^(srsltid|gclid|gbraid|wbraid|fbclid|msclkid|gad_[a-z_]*|utm_[a-z]*)=/i.test(param));
	return kept.length > 0 ? `${address}?${kept.join('&')}` : address;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index, text: clean(m[1]) }));
	const starts = [...html.matchAll(ITEM)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	starts.forEach((at, k) => {
		// an item runs to the next item or the next fund's heading, whichever
		// comes first, so the last of a fund cannot borrow what follows it
		const next = Math.min(starts[k + 1] ?? html.length, headings.find((h) => h.at > at)?.at ?? html.length);
		const item = html.slice(at, next);
		const text = item.match(TEXT)?.[0];
		if (!text) return;

		const titles = [...text.matchAll(TITLE)].map((m) => clean(m[1]));
		const name = (titles[0] ?? '').replace(ALIAS, ' ').trim();
		if (!name || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());

		const fund = headings.filter((h) => h.at < at).pop()?.text.match(FUND)?.[1];
		const lines = [...text.matchAll(LINE)].map((m) => clean(m[1])).filter((t) => t && t !== '•');
		companies.push({
			name,
			category: [
				fund ? `Fund ${fund.toUpperCase()}` : '',
				sector(lines[0] ?? ''),
				titles.slice(1).some((t) => /^exited$/i.test(t)) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: website(item.match(SITE)?.[1] ?? '')
		});
	});

	if (companies.length === 0) {
		throw new Error('howwomeninvest: no companies on the portfolio page');
	}

	return companies;
}
