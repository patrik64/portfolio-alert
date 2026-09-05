import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://jamfund.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the portfolio on the front page as image-hover cards: each
// wraps its logo in a link to the company's own address and names the
// company in the hover's heading, over a one-line description. no sectors
// anywhere.

// the class names also appear in the page's inline stylesheet, so both
// patterns anchor on real elements rather than the bare class strings
const CARD = '<div class="oxi-image-hover-style-general">';
const SITE = /<a\s+href="(https?:\/\/[^"]+)"/;
const NAME = /<h3 class="oxi-image-hover-heading[^>]*>([^<]+)</;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: card.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('jamfund: no companies on the page');
	}

	return companies;
}
