import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.owlvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow with a finsweet list over it. the whole portfolio is written into
// the page — the filters are done in the browser, so every company is there
// whichever way the page is left — and each card carries its own panel: the
// name, what the fund files it under, where the company is, its site, and
// whether it has been bought.
//
// the fund files a company two ways, by what it teaches and by where it is,
// and both are drawn from lists it maintains: three subcategories and five
// geographies. it also writes a headquarters on each panel, which is finer
// than the geography but is typed by hand and disagrees with itself —
// Atlanta, GA against Atlanta, Georgia, and San Francisco three ways. so the
// lists are the category and the headquarters is left out.
//
// the fund names the buyer where it has one. that is the shape of the exit
// rather than anything about the company, so the tag is just the exit.

const CARD = /<div role="listitem" class="w-dyn-item"><div fs-list-field="\*"/g;
const NAME = /class="text-block-10"[^>]*>([\s\S]*?)<\/div>/;
const TAG = /class="sub-category"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="button black-bg/;
// webflow hides a field that has nothing in it by adding a class, so the tag
// standing on its own is the company that has actually been bought
const ACQUIRED = /class="acquired-text"/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const starts = [...html.matchAll(CARD)].map((m) => m.index);
	if (starts.length === 0) {
		throw new Error('owl: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const card = html.slice(at, starts[i + 1] ?? html.length);

		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...[...card.matchAll(TAG)].map((m) => tag(m[1])), ACQUIRED.test(card) ? 'Acquired' : '']
				.filter(Boolean)
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('owl: no companies behind the portfolio grid');
	}

	return companies;
}
