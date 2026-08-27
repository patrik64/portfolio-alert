import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.worldfund.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 20;

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the webflow portfolio grid links each company to its detail page, which
// carries the company site (after a "Website:" label) and the climate segment.
// a card whose tba-state is visible is a stealth investment the fund has not
// announced — it renders as "to be announced", so it stays out until named.
// an exited company shows its exited-state overlay and gets an Exited tag.

async function fetchDetail(path: string): Promise<{ segment: string; website: string }> {
	try {
		const resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return { segment: '', website: '' };
		const html = await resp.text();
		return {
			segment: decode(html.match(/>Segment<\/h3><p class="pinfo">([^<]*)</)?.[1] ?? ''),
			// the label varies: "Website:" or "Website", wrapped in assorted tags
			website:
				html.match(/Website:?\s*(?:<\/?\w[^>]*>|\s)*<a\s[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? ''
		};
	} catch {
		return { segment: '', website: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const entries: { name: string; path: string; exited: boolean }[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="ci-portfolio w-dyn-item').slice(1)) {
		const path = item.match(/href="(\/portfolio\/[^"]+)"/)?.[1];
		const name = decode(item.match(/<h2 class="h-portfolio-company-name">([^<]*)<\/h2>/)?.[1] ?? '');
		if (!path || !name || seen.has(path)) continue;
		if (/class="tba-state(?!\s+w-condition-invisible)/.test(item)) continue;
		seen.add(path);
		entries.push({
			name,
			path,
			exited: /class="exited-state(?!\s+w-condition-invisible)/.test(item)
		});
	}
	if (entries.length === 0) {
		throw new Error('worldfund: no companies on the portfolio page');
	}

	// fetch segment + website from the detail pages (in batches)
	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const details = await Promise.all(batch.map((e) => fetchDetail(e.path)));
		for (let j = 0; j < batch.length; j++) {
			companies.push({
				name: batch[j].name,
				category: [details[j].segment, ...(batch[j].exited ? ['Exited'] : [])]
					.filter(Boolean)
					.join(', '),
				url: details[j].website
			});
		}
	}

	return companies;
}
