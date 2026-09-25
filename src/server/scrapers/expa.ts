import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.expa.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of its own, rendered on the server: the portfolio page ships every
// company twice, as a tile in the grid and as the article the tile opens.
// the article names the company, tells its story and lists what the fund
// knows of it — founders, website, x account, location — and, for one sold,
// closes the story with a line of its own: "Acquired by Elastic." that line
// is kept, with the Exited tag; the location is the category. a company
// without a website listed links to its article on the page.

const ARTICLE = /(?=<article class="portfolio__company\b)/;
const ID = /^<article[^>]*\bid="([^"]+)"/;
const NAME = /class="portfolio__company__title"[^>]*>([\s\S]*?)<\/h\d>/;
const CONTENT = /class="portfolio__company__content"[^>]*>([\s\S]*?)<\/div>/;
const PARAGRAPH = /<p>([\s\S]*?)<\/p>/g;
const FACT = /<li><strong>([^<]*)<\/strong><br\s*\/?>([\s\S]*?)<\/li>/g;
// one address is typed with a space before it (" https://atcresearch.co")
const LINK = /<a\b[^>]*\bhref="\s*(https?:\/\/[^"\s]+)\s*"/;
const OUTCOME = /^(acquired|merged|exited|ipo)\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "New York, NY" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ARTICLE).slice(1)) {
		const article = chunk.split('</article>')[0];
		const name = clean(article.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const facts = new Map(
			[...article.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), value])
		);
		// the story's closing line, when it says how the company went
		const outcome = [...(article.match(CONTENT)?.[1] ?? '').matchAll(PARAGRAPH)]
			.map((m) => clean(m[1]))
			.filter((line) => OUTCOME.test(line))
			.at(-1)
			?.replace(/\.$/, '');
		const site = unescape(facts.get('website')?.match(LINK)?.[1] ?? '');
		const id = article.match(ID)?.[1];
		companies.push({
			name,
			category: [tag(facts.get('location') ?? ''), outcome ? tag(outcome) : '', outcome ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: site || (id ? `${PAGE_URL}#${id}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('expa: no companies on the portfolio page');
	}

	return companies;
}
