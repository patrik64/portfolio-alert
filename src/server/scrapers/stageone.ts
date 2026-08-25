import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://stageonevc.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress + JetEngine) renders a logo grid whose only
// data is each company's detail-page url. the detail pages carry structured
// "<b>Field:</b> value" headings — Company Name, Sector, Status — plus the
// company site behind a "Website:" heading, so each one gets fetched

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const pages = [
		...new Set(
			[...html.matchAll(/jet-engine-listing-overlay-wrap" data-url="(https:\/\/stageonevc\.com\/[^"]+)"/g)].map(
				(m) => m[1]
			)
		)
	];
	if (pages.length === 0) {
		throw new Error('stageone: no companies found in the portfolio grid');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < pages.length; i += 8) {
		await Promise.all(
			pages.slice(i, i + 8).map(async (pageUrl) => {
				// the slug carries the identity if the detail page won't load
				const slug = pageUrl.replace(/\/$/, '').split('/').pop() ?? '';
				let name = slug
					.replace(/-\d+$/, '')
					.split('-')
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join(' ');
				let category = '';
				let url = pageUrl;
				try {
					const detail = await fetch(pageUrl, { headers: { 'User-Agent': UA } });
					if (detail.ok) {
						const page = await detail.text();
						name = decode(page.match(/<b>Company Name:<\/b>\s*([^<]+)</)?.[1] ?? '') || name;
						const sector = decode(page.match(/<b>Sector:<\/b>\s*([^<]+)</)?.[1] ?? '');
						const status = decode(page.match(/<b>Status:<\/b>\s*([^<]+)</)?.[1] ?? '');
						category = [sector, status.toLowerCase() === 'active' ? '' : status]
							.filter(Boolean)
							.join(', ');
						url = page.match(/<a href="(https?:\/\/[^"]+)"[^>]*><b>Website:<\/b>/)?.[1] ?? url;
					}
				} catch {
					// the slug-derived fallbacks stand
				}
				companies.push({ name, category, url });
			})
		);
	}

	return companies;
}
