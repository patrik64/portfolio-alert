import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.forerunnerventures.com/investments/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static site with its content in sanity: the investments page is one
// list, each row naming the company with the year the fund came in, a
// "Visit" link to its site and the fund's tags for it, joined by middle dots
// ("Platforms & Infrastructure · AI as Infrastructure").

const ROW = /(?=<li class="invest__row\b)/;
const NAME = /class="invest__name">([\s\S]*?)<\/h3>/;
const YEAR = /class="invest__year">\s*(\d{4})\s*</;
const SITE = /<a class="invest__visit" href="(https?:\/\/[^"]+)"/;
const TAGS = /class="invest__tags">([\s\S]*?)<\/p>/;
const EXIT = /^(exited?|acquired|ipo)$/i;
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
	for (const chunk of html.split(ROW).slice(1)) {
		const row = chunk.split('</li>')[0];
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const tags = clean(row.match(TAGS)?.[1] ?? '')
			.split('·')
			.map(tag)
			.filter(Boolean);
		const year = row.match(YEAR)?.[1];
		companies.push({
			name,
			category: [
				...tags.filter((t) => !EXIT.test(t)),
				year ? `Invested ${year}` : '',
				tags.some((t) => EXIT.test(t)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(row.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('forerunner: no companies on the investments page');
	}

	return companies;
}
