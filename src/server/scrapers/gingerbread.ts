import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://gingerbreadcap.com/portfolio/';
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on wp engine, a theme of its own. the portfolio page draws every
// company twice, as a grid and as a list; the grid is read. a card names the
// company, carries the page's filters as classes ("filter-fintech",
// "filter-exit" for the ones the fund is out of) — spelled out by the filter
// menu above it — and links the company's page here. that page lists the
// company's facts, its site among them, and the round and year the fund came
// in; those pages are fetched in batches, and a page that will not load
// leaves its company linking to that page. the rest api has the companies but
// not those facts.

const CARD = /(?=<li class="grid-invest\b)/;
const NAME = /class="invest-grid-title">([\s\S]*?)<\/div>/;
const PAGE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const CLASSES = /^<li class="([^"]*)"/;
const FILTER = /data-filter="(filter-[^"]+)"\s+data-name="([^"]*)"/g;
const FACT = /class="stat-label[^"]*">([\s\S]*?)<\/div>[\s\S]*?class="stat-text">([\s\S]*?)<\/div>/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const YEAR = /^(?:19|20)\d{2}$/;
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

interface Facts {
	site: string;
	round: string;
	year: string;
}

async function factsOf(page: string): Promise<Facts | null> {
	try {
		const resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return null;
		const html = await resp.text();
		const facts = new Map(
			[...html.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), value])
		);
		const year = clean(facts.get('year invested') ?? '');
		return {
			site: unescape(facts.get('website')?.match(LINK)?.[1] ?? ''),
			round: tag(facts.get('round invested') ?? ''),
			year: YEAR.test(year) ? year : ''
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const labels = new Map([...html.matchAll(FILTER)].map(([, key, label]) => [key, tag(label)]));

	const listed: { name: string; page: string; filters: string[] }[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		const card = chunk.split('</li>')[0];
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const filters = (card.match(CLASSES)?.[1] ?? '').split(/\s+/).filter((c) => c.startsWith('filter-'));
		listed.push({ name, page: unescape(card.match(PAGE)?.[1] ?? ''), filters });
	}
	if (listed.length === 0) {
		throw new Error('gingerbread: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const details = await Promise.all(
			batch.map((c) => (c.page ? factsOf(c.page) : Promise.resolve(null)))
		);
		batch.forEach(({ name, page, filters }, j) => {
			const facts = details[j];
			companies.push({
				name,
				category: [
					...filters
						.filter((f) => f !== 'filter-exit' && f !== 'filter-all')
						.map((f) => labels.get(f) ?? ''),
					facts?.round ?? '',
					facts?.year ? `Invested ${facts.year}` : '',
					filters.includes('filter-exit') ? 'Exited' : ''
				]
					.filter((t, k, all) => t && all.indexOf(t) === k)
					.join(', '),
				url: facts?.site || page
			});
		});
	}

	return companies;
}
