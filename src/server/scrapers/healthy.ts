import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://healthy.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a logo, whose alt text names it, linking the
// company's site — or, for some bought outright, the buyer's (pokitdok's goes
// to change healthcare) — beside a paragraph about it. a company the fund is
// out of opens that paragraph with how it went, in bold: "Acquired by
// mPulse", "Merged with Nice Healthcare", "Acquired by Invitae (NYSE: NVTA),
// now LabCorp". that is kept, with the Exited tag; the rest of the paragraph
// is prose.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*collection-item)/;
const NAME = /<img[^>]*\salt="([^"]+)"/;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"/;
const OUTCOME = /class="[^"]*rich-text-block[^"]*"[^>]*>\s*<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>/;
const EXIT = /^(acquired|merged|ipo|exited|went public|listed)\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = tag(item.match(OUTCOME)?.[1] ?? '');
		const exited = EXIT.test(outcome);
		companies.push({
			name,
			category: exited ? `${outcome}, Exited` : '',
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('healthy: no companies on the portfolio page');
	}

	return companies;
}
