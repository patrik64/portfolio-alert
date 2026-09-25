import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://eraventures.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: every company is a row that unfolds, the
// name and a line about it on the row and, inside, a paragraph, a "Website"
// button linking the company's site and the industries the fund files it
// under ("AI and Data", "Physical AI"). nothing marks an exit.

const ITEM = /(?=<div\b[^>]*class="[^"]*\bcompany-item\b)/;
const NAME = /class="[^"]*\btype--subhead\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const WEBSITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*Website\s*<\/a>/i;
const INDUSTRY = /<span class="button--secondary">\s*([\s\S]*?)\s*<\/span>/g;
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
	for (const chunk of html.split(ITEM).slice(1)) {
		// a row ends where its unfolded content does; the last would otherwise
		// run on into the footer
		const item = chunk.split('</div> </div> </div> </div>')[0];
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...item.matchAll(INDUSTRY)]
				.map((m) => tag(m[1]))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(WEBSITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('era: no companies on the companies page');
	}

	return companies;
}
