import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.thelabventures.com';
const PAGE_URL = `${BASE_URL}/`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio on the front page. every card names its company in
// a hidden heading and files it under industries, a stage and the year the
// fund came in; the regions are toggled by a little inline script per card,
// so the ones its conditions say 'true' about are read straight out of the
// code. cards link only to pages of the fund's own, and each of those pages
// carries the company's address as its one link that leads off the site.

const CARD = /<article id="([^"]+)" class="c-portfolio__card">([\s\S]*?)<\/article>/g;
const NAME = /<h3 class="visually-hidden">([^<]*)</;
const INDUSTRY = /fs-cmsfilter-field="industry">([^<]*)</g;
const STAGE = /fs-cmsfilter-field="stage">([^<]*)</;
const YEAR = /fs-cmsfilter-field="year">([^<]*)</;
const ZONE = /if\('true' == 'true'\)[\s\S]{0,200}?zone">([^<]+)<\/span>/g;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the site's own furniture: anything here is not the company's address
const NOISE = /thelabventures|website-files|gstatic|googleapis|google\.com|linkedin|twitter|instagram|facebook|youtube|w3\.org|cookiefirst|weglot|recaptcha/;

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

// the category is comma-joined, so a tag holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);

	const cards = [...html.matchAll(CARD)].map(([, slug, body]) => ({ slug, body }));
	if (cards.length === 0) {
		throw new Error('thelab: no portfolio cards on the page');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		await Promise.all(
			cards.slice(i, i + BATCH_SIZE).map(async (card) => {
				try {
					const page = await fetchPage(`${BASE_URL}/portfolio/${card.slug}`);
					const site = [...page.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(card.slug, site);
				} catch {
					// the card already names the company; it just goes without its address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { slug, body } of cards) {
		const name = clean(body.match(NAME)?.[1] ?? '');
		// a stealth card names nobody yet
		if (!name || /stealth/i.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				...[...body.matchAll(INDUSTRY)].map((m) => tag(m[1])),
				...[...body.matchAll(ZONE)].map((m) => tag(m[1])),
				tag(body.match(STAGE)?.[1] ?? ''),
				clean(body.match(YEAR)?.[1] ?? '')
			]
				.filter(Boolean)
				.join(', '),
			url: sites.get(slug) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('thelab: no companies among the portfolio cards');
	}

	return companies;
}
