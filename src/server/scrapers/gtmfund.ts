import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.gtmfund.com';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const COUNT_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=1&_fields=id`;
const MAX_PAGES = 10;
// the share of the rest api's count the list must reach to be believed
const MIN_SHARE = 0.9;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor. the portfolio page opens on the featured
// companies and draws the rest, under its "All" tab, through the theme's own
// admin-ajax action, a page at a time until it says there is no more — the
// first forty, then everything after; asking past the end answers with the
// last page again, so the walk also stops at a page that adds no one. each
// card names the company in a link to its site, says what it does and gives
// its category; the stage it has reached is only in the card's classes, where
// "current-stage-acquired" marks the ones the fund is out of. the rest api
// lists the same companies without their sites, so it serves only to count
// them: a list that comes up well short of that count has lost its way.

const ITEM = /(?=<div class="zl-default-item)/;
const POST_ID = /\be-loop-item-(\d+)\b/;
const CLASSES = /class="elementor elementor-\d+ e-loop-item\b([^"]*)"/;
const TITLE = /<h3\b[^>]*>\s*(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>)?([\s\S]*?)<\/(?:a|h3)>/;
const CATEGORY = /zl-category-all-tab[\s\S]*?<div class="elementor-shortcode">([\s\S]*?)<\/div>/;
const ACQUIRED = /\bcurrent-stage-acquired\b/;
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

interface Answer {
	success?: boolean;
	data?: { html?: string; has_more?: number | string | boolean };
}

async function page(n: number): Promise<{ html: string; more: boolean }> {
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA },
		body: new URLSearchParams({ action: 'filter_portfolio', page: String(n), type: 'all' })
	});
	if (!resp.ok) {
		throw new Error(`gtmfund: the portfolio list answered ${resp.status} for page ${n}`);
	}
	const { success, data } = (await resp.json()) as Answer;
	if (!success || typeof data?.html !== 'string') {
		throw new Error(`gtmfund: the portfolio list gave no companies for page ${n}`);
	}
	return {
		html: data.html.replace(/<style[\s\S]*?<\/style>/g, ''),
		more: data.has_more === true || String(data.has_more) === '1'
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const cards = new Map<string, string>();
	for (let n = 1; n <= MAX_PAGES; n++) {
		const { html, more } = await page(n);
		let added = 0;
		for (const card of html.split(ITEM).slice(1)) {
			const id = card.match(POST_ID)?.[1];
			if (!id || cards.has(id)) continue;
			cards.set(id, card);
			added++;
		}
		if (!more || added === 0) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards.values()) {
		const title = card.match(TITLE);
		const name = clean(title?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = ACQUIRED.test(card.match(CLASSES)?.[1] ?? '');
		companies.push({
			name,
			category: [tag(card.match(CATEGORY)?.[1] ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: unescape(title?.[1] ?? '').trim()
		});
	}

	const counted = await fetch(COUNT_URL, { headers: { 'User-Agent': UA } });
	const total = counted.ok ? Number(counted.headers.get('x-wp-total')) || 0 : 0;
	if (total > 0 && companies.length < total * MIN_SHARE) {
		throw new Error(
			`gtmfund: the portfolio list gave ${companies.length} of the ${total} companies the rest api counts`
		);
	}
	if (companies.length === 0) {
		throw new Error('gtmfund: the portfolio list gave no companies');
	}

	return companies;
}
