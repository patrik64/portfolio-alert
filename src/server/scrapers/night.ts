import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nightventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page with no cms behind it. the companies have no page of
// their own — /companies and /portfolio are both 404 — and are a section of
// the front page, so that is what is read, and only the section: the studio
// writes about itself in the same markup above it.
//
// a company is a link to its own site, with the name, a line about what it is,
// and the tags the studio files it under, one of which says how it was built.

const SECTION = /id="companies"([\s\S]*?)<\/section>/;
const ITEM = /<a class="co" href="([^"]*)"([\s\S]*?)<\/a>/g;
const NAME = /class="co-title">([\s\S]*?)<\/span>/;
const TAG = /<span class="tag[^"]*">([\s\S]*?)<\/span>/g;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;|&ldquo;|&rdquo;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&mdash;/g, '—')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const section = html.match(SECTION)?.[1];
	if (!section) {
		throw new Error('night: the front page no longer has a companies section');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, body] of section.matchAll(ITEM)) {
		const name = clean(body.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...body.matchAll(TAG)]
				.map((match) => tag(match[1]))
				.filter(Boolean)
				.join(', '),
			url: clean(href)
		});
	}

	if (companies.length === 0) {
		throw new Error('night: no companies in the companies section');
	}

	return companies;
}
