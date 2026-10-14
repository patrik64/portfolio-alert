import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://freigeist.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page: the portfolio is a grid of logos, a logo a company named in
// its alt text and linking its site; above it a slider features ten of them,
// each with a few lines and the year the fund invested ("lilium.com |
// Invested since 2015"). the year is kept as a tag where the slider gives
// it; the fund does not say which companies it is out of.

const GRID = /class="startups-grid">([\s\S]*?)<\/ul>/;
const ITEM = /<li class="__content">\s*<a href="([^"]*)"[^>]*>\s*<img\b[^>]*\balt="([^"]*)"/g;
const SLIDE = /<div class="swiper-slide-inner">([\s\S]*?)Invested since ((?:19|20)\d{2})/g;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the year the slider gives each company it features, by name
	const invested = new Map<string, string>();
	for (const [, slide, year] of html.matchAll(SLIDE)) {
		const name = clean(slide.match(ALT)?.[1] ?? '');
		if (name) invested.set(name.toLowerCase(), year);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, alt] of (html.match(GRID)?.[1] ?? '').matchAll(ITEM)) {
		const name = clean(alt);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = invested.get(name.toLowerCase());
		const site = unescape(href).trim();
		companies.push({
			name,
			category: [year ? `Invested ${year}` : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('freigeist: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
