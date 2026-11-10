import type { ScrapedCompany } from './types';

// the site was rebuilt on 2026-11-09: /investments/ is gone and the
// portfolio is a section of the "Tech & Brands" page
const PAGE_URL = 'https://www.fernbrookmgmt.com/tech-brands/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under beaver builder: the portfolio is a grid of cards, each a
// logo, the company's name as a heading, a line of labels — "Exited", or
// "Partial Exit" beside what the company is ("Payment Services Provider") —
// and its site. the labels are kept as tags, "Exited" as the Exited tag. the
// blog's cards further down share the grid's markup but carry no name
// heading, so they fall away.
//
// the rebuild renamed a few companies the old page listed ("Alfred" is now
// "Alfred / Arqline", "Akin's Army" is "AARMY"), and each is kept under the
// name it was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	'alfred / arqline': 'Alfred',
	'material retail': 'Material',
	'lily ai': 'Lily.ai',
	'ember tech': 'Ember Technologies',
	brewbird: 'Brew Bird',
	beautycounter: 'Beauty Counter',
	aarmy: "Akin's Army",
	'wright bedding': 'Wright'
};

const CARD = /<li\s+class="fl-loop-item">([\s\S]*?)<\/li>/g;
const NAME = /<h3\b[^>]*\bportfolio-title\b[^>]*>([\s\S]*?)<\/h3>/;
const STATUS = /<div class=['"]fl-company_status['"]>([\s\S]*?)<\/div>/;
const LABEL = /<span class="[^"]*">([^<]+)<\/span>/g;
const SITE = /<p class="portfolio-url">\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXITED = /^exit(?:ed)?$/i;
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
	for (const [, card] of html.matchAll(CARD)) {
		const written = clean(card.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = [...(card.match(STATUS)?.[1] ?? '').matchAll(LABEL)].map(([, l]) => tag(l)).filter(Boolean);
		const exited = labels.some((l) => EXITED.test(l));
		companies.push({
			name,
			category: [...labels.filter((l) => !EXITED.test(l)), exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(card.match(SITE)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('fernbrook: no portfolio cards on the page — the markup moved');
	}

	return companies;
}
