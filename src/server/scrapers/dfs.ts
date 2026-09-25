import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.dfs.vc/portfolio.html';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page of its own: every company is a card headed with its name,
// linking its site where one is given, with the tags the fund files it
// under ("Fintech", "Critical Infrastructure") and a line about it. the
// filters run in the browser, so the page holds every card. nothing marks
// an exit.

const CARD = /(?=<article\b[^>]*class="card card--portfolio")/;
const NAME = /class="card__name"[^>]*>([\s\S]*?)<\/h\d>/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const TAG = /class="tag[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		const card = chunk.split('</article>')[0];
		const heading = card.match(NAME)?.[1] ?? '';
		const name = clean(heading);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...card.matchAll(TAG)]
				.map((m) => tag(m[1]))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(heading.match(LINK)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('dfs: no companies on the portfolio page');
	}

	return companies;
}
