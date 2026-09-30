import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.btn.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a table served whole, a row a company —
// its name, a line about it, its industry ("EdTech", "Fintech"), the stage
// the fund came in at and the year it was founded — each opening a panel
// served in the page too, with the founders and, for most, the company's
// site written out. nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="portfolio-item w-dyn-item")/;
const NAME = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const FACT = /<div class="portfolio-info-block-title-white">([\s\S]*?)<\/div>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map([...item.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
		const founded = facts.get('founded')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = facts.get('website') ?? '';
		companies.push({
			name,
			category: [tag(facts.get('industry') ?? ''), tag(facts.get('stage') ?? ''), founded ? `Founded ${founded}` : '']
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('btn: no companies on the portfolio page');
	}

	return companies;
}
