import type { ScrapedCompany } from './types';

const BASE_URL = 'https://futurefoodfund.nl';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const LINKS_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100&_fields=id,link`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a block of the theme's own: every company is a logo card whose
// data attributes carry what the page's filters read — the year the fund came
// in, the country, the category ("Sustainable farming") and the status: "in
// portfolio", "exited", or "we tried" for one that did not make it, which is
// kept as the words rather than counted an exit. each card opens a lightbox
// naming the company under the fund that holds it ("Future Food Fund II").
// the site links no company's own site anywhere, so each links to its page
// here, which the rest api's portfolio type gives by id.

const CARD = /<article\b([^>]*\bclass="portfolio-block-grid-item"[^>]*)>([\s\S]*?)<\/article>/g;
const LIGHTBOX = /href="#lightbox-(\d+)"/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"/;
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

const attr = (element: string, name: string) =>
	unescape(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '').trim();

// the lightbox for a card: the fund in its h4, the company in its h3
function lightbox(html: string, id: string): { fund: string; name: string } {
	const at = html.indexOf(`id="lightbox-${id}"`);
	if (at < 0) return { fund: '', name: '' };
	const box = html.slice(at, at + 2000);
	return {
		fund: clean(box.match(/<h4>([\s\S]*?)<\/h[34]>/)?.[1] ?? ''),
		name: clean(box.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '')
	};
}

// each company's page here, by its post id
async function pages(): Promise<Map<string, string>> {
	try {
		const resp = await fetch(LINKS_URL, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return new Map();
		const posts = (await resp.json()) as { id?: number; link?: string }[];
		return new Map(posts.filter((p) => p.id && p.link).map((p) => [String(p.id), p.link as string]));
	} catch {
		return new Map();
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [resp, links] = await Promise.all([fetch(PAGE_URL, { headers: { 'User-Agent': UA } }), pages()]);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attrs, card] of html.matchAll(CARD)) {
		const id = card.match(LIGHTBOX)?.[1] ?? '';
		const box = id ? lightbox(html, id) : { fund: '', name: '' };
		const name = box.name || clean(card.match(LOGO)?.[1] ?? '').replace(/\s+logo$/i, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = attr(attrs, 'data-status').toLowerCase();
		const year = attr(attrs, 'data-year');
		companies.push({
			name,
			category: [
				tag(attr(attrs, 'data-category').replace(/\.$/, '')),
				// "Future Food Fund II" -> "Fund II"
				tag(box.fund.replace(/^future food\s+/i, '')),
				/^\d{4}$/.test(year) ? `Invested ${year}` : '',
				tag(attr(attrs, 'data-country')),
				status === 'exited' ? 'Exited' : status === 'we tried' ? 'We tried' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: links.get(id) ?? (id ? `${BASE_URL}/?p=${id}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('futurefood: no companies on the portfolio page');
	}

	return companies;
}
