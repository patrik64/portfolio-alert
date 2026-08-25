import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://qumracapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress) renders a card per company — name in an h3,
// an "exited" marker in the card class, and a link to qumra's own detail
// page, where the company site sits behind a "See more on" anchor

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const entries: { name: string; exited: boolean; page: string }[] = [];
	for (const card of html.split(/<li class="card all/).slice(1)) {
		const name = decode(
			(card.match(/<div class="name">\s*<h3>\s*([\s\S]*?)\s*<\/h3>/)?.[1] ?? '').replace(/<[^>]+>/g, '')
		);
		if (!name) continue;
		entries.push({
			name,
			exited: /^[^"]*exited/.test(card),
			page: card.match(/<a href="(https?:\/\/qumracapital\.com\/company\/[^"]+)"/)?.[1] ?? ''
		});
	}

	if (entries.length === 0) {
		throw new Error('qumra: no companies found on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += 8) {
		await Promise.all(
			entries.slice(i, i + 8).map(async ({ name, exited, page }) => {
				let url = page;
				if (page) {
					try {
						const detail = await fetch(page, { headers: { 'User-Agent': UA } });
						if (detail.ok) {
							const site = (await detail.text()).match(
								/class="url">[\s\S]{0,100}?<a href="(https?:\/\/[^"]+)"/
							)?.[1];
							if (site) url = site;
						}
					} catch {
						// keep the detail-page url
					}
				}
				companies.push({ name, category: exited ? 'Exited' : '', url });
			})
		);
	}

	return companies;
}
