import type { ScrapedCompany } from './types';

const SITE_URL = 'https://www.cyberstarts.com';
const PAGE_URL = `${SITE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio (Webflow CMS) renders a card per company: the name in the
// logo's alt text, an "Acquired by …" line on the exits, and a link to the
// company's page on cyberstarts.com, where the site hides behind a url button

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const items = [...html.matchAll(/class="companies-grid_citem w-dyn-item"/g)];
	if (items.length === 0) {
		throw new Error('cyberstarts: no companies found on the portfolio page');
	}

	const entries: { name: string; acquired: string; page: string }[] = [];
	for (const [i, item] of items.entries()) {
		const seg = html.slice(item.index, items[i + 1]?.index ?? html.length);
		const name = decode(seg.match(/<img alt="([^"]*)"/)?.[1] ?? '');
		if (!name) continue;
		entries.push({
			name,
			// the "Acquired by" block exists on every card but carries the
			// w-condition-invisible class unless the company actually exited
			acquired: decode(
				seg.match(/media_date is-small"><div class="w-embed">([^<]*)</)?.[1] ?? ''
			),
			page: seg.match(/href="(\/companies\/[^"]+)"/)?.[1] ?? ''
		});
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += 8) {
		await Promise.all(
			entries.slice(i, i + 8).map(async ({ name, acquired, page }) => {
				let url = page ? `${SITE_URL}${page}` : '';
				if (page) {
					try {
						const detail = await fetch(url, { headers: { 'User-Agent': UA } });
						if (detail.ok) {
							const site = (await detail.text()).match(
								/type-of-btn="url"[^>]*href="(https?:\/\/[^"]+)"/
							)?.[1];
							if (site) url = site;
						}
					} catch {
						// keep the detail-page url
					}
				}
				companies.push({ name, category: acquired, url });
			})
		);
	}

	return companies;
}
