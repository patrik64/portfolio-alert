import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.kaporcapital.com/portfolio/';
const AJAX_URL = 'https://www.kaporcapital.com/wp-admin/admin-ajax.php';
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with a scroll-fed grid: the page carries a dozen cards, a page
// count and a nonce, and admin-ajax hands over the remaining pages to
// whoever presents that nonce. each card names the company and gives its
// sector and the year the fund came in; the company's own address appears
// only in the popup a second ajax action serves, so those are fetched in
// batches by card id.

const NONCE = /id="portfolio-nonce"[^>]*value="([^"]+)"/;
const MAX_PAGES = /id="portfolio-results"[^>]*data-max="(\d+)"/;
const CARD = '<div class="company portfolio-company"';
const CARD_HEAD = /^ data-company-id="(\d+)" data-company-name="([^"]*)"/;
const YEAR = /company-year">([^<]*)</;
const SECTOR = /company-sector">\s*([^<]*)</;
const STATUSES = /company-statuses">([\s\S]*?)<\/div>/;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the popup's own furniture: anything here is not the company's address
const NOISE = /kaporcapital|linkedin|twitter|facebook|instagram|youtube|crunchbase/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

interface Card {
	id: string;
	name: string;
	year: string;
	sector: string;
	status: string;
}

function parseCards(html: string, into: Card[]) {
	for (const chunk of html.split(CARD).slice(1)) {
		const head = chunk.match(CARD_HEAD);
		if (!head) continue;
		into.push({
			id: head[1],
			name: clean(head[2]),
			year: clean(chunk.match(YEAR)?.[1] ?? ''),
			sector: tag(chunk.match(SECTOR)?.[1] ?? ''),
			status: tag(chunk.match(STATUSES)?.[1] ?? '')
		});
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const nonce = html.match(NONCE)?.[1];
	if (!nonce) {
		throw new Error('kapor: no nonce on the portfolio page');
	}
	const maxPages = Number(html.match(MAX_PAGES)?.[1] ?? 1);

	const cards: Card[] = [];
	parseCards(html, cards);
	for (let page = 1; page < maxPages; page++) {
		const more = await fetch(
			`${AJAX_URL}?action=load_more_companies&current_page=${page}&max_pages=${maxPages}&nonce=${nonce}`,
			{ headers: { 'User-Agent': UA } }
		);
		if (!more.ok) {
			throw new Error(`Failed to load page ${page + 1}: ${more.status}`);
		}
		const { data } = (await more.json()) as { data?: string };
		parseCards(data ?? '', cards);
	}
	if (cards.length === 0) {
		throw new Error('kapor: no companies in the portfolio grid');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		await Promise.all(
			cards.slice(i, i + BATCH_SIZE).map(async (card) => {
				try {
					const info = await fetch(
						`${AJAX_URL}?action=load_company_info&companyId=${card.id}&nonce=${nonce}`,
						{ headers: { 'User-Agent': UA } }
					);
					const { data } = (await info.json()) as { data?: { output?: string } | string };
					const output = typeof data === 'string' ? data : (data?.output ?? '');
					const site = [...output.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(card.id, site);
				} catch {
					// the card already names the company; it just goes without its address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		if (!card.name || seen.has(card.name.toLowerCase())) continue;
		seen.add(card.name.toLowerCase());
		companies.push({
			name: card.name,
			category: [
				card.sector,
				card.year,
				card.status,
				/acquired|exited/i.test(card.status) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: sites.get(card.id) ?? ''
		});
	}

	return companies;
}
