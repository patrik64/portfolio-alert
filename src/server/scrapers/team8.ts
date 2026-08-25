import type { ScrapedCompany } from './types';

const SITE_URL = 'https://team8.vc';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the /portfolio/ page (WordPress) only features the dozen newest companies
// and hides the rest (Claroty, Sygnia, …) — but every portfolio post is in
// the portfolio sitemap, and each detail page carries the name (h1), a
// "Domain:" line, and the company site behind an info-link anchor

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(`${SITE_URL}/portfolio-sitemap.xml`, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${SITE_URL}/portfolio-sitemap.xml: ${resp.status}`);
	}
	const sitemap = await resp.text();

	const pages = [
		...new Set(
			[...sitemap.matchAll(/<loc>(https:\/\/team8\.vc\/portfolio\/[^<]+)<\/loc>/g)].map((m) => m[1])
		)
	];
	if (pages.length === 0) {
		throw new Error('team8: no companies in the portfolio sitemap');
	}

	// crawl gently — the site throttles bursts, which once degraded half the
	// results to slug-derived fallbacks: small batches, a pause between them,
	// one retry on a refused response
	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < pages.length; i += 4) {
		await Promise.all(
			pages.slice(i, i + 4).map(async (page) => {
				// the slug stands in if the detail page won't load
				let name = (page.replace(/\/$/, '').split('/').pop() ?? '')
					.split('-')
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join(' ');
				let category = '';
				let url = page;
				try {
					let detail = await fetch(page, { headers: { 'User-Agent': UA } });
					if (!detail.ok) {
						await new Promise((r) => setTimeout(r, 2000));
						detail = await fetch(page, { headers: { 'User-Agent': UA } });
					}
					if (detail.ok) {
						const html = await detail.text();
						name = decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, '')) || name;
						category = decode(html.match(/Domain:<\/strong>\s*([^<]*)</)?.[1] ?? '');
						url =
							html.match(/class="info-link[^"]*">\s*<a class="custom-link[^"]*" href="(https?:\/\/[^"]+)"/)?.[1] ??
							url;
					}
				} catch {
					// the slug-derived fallbacks stand
				}
				companies.push({ name, category, url });
			})
		);
		await new Promise((r) => setTimeout(r, 1000));
	}

	return companies;
}
