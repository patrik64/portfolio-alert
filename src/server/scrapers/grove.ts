import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.grovevc.com/grove-portfolio-companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress) renders a box per company whose css class IS
// the company name ("portfolio-box Majestic Labs"), with sector ids in
// data-category (mapped by the filter nav's data-term buttons) and an
// Acquired/Stealth badge. the company site sits on the linked detail page as
// a web-link anchor. stealth-badged boxes are unannounced placeholders — some
// only naming a sector — and are skipped

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const termName = new Map<string, string>();
	for (const m of html.matchAll(/data-term="(\d+)"[^>]*>\s*([\s\S]{0,60}?)\s*<\/a>/g)) {
		termName.set(m[1], decode(m[2].replace(/<[^>]+>/g, '')));
	}

	const boxes = [...html.matchAll(/class="portfolio-box ([^"]*)"\s+data-category="([^"]*)"/g)];
	if (boxes.length === 0) {
		throw new Error('grove: no companies found on the portfolio page');
	}

	const entries: { name: string; categories: string[]; page: string }[] = [];
	for (const [i, box] of boxes.entries()) {
		const seg = html.slice(box.index, boxes[i + 1]?.index ?? html.length);
		const badge = seg.match(/portfolio-badge[^"]*"><span>\s*([^<]*?)\s*<\/span>/)?.[1] ?? '';
		if (/stealth/i.test(badge)) continue;
		const name = decode(box[1].replace(/\bno-hover-text\b/g, ''));
		if (!name) continue;
		entries.push({
			name,
			categories: [
				...box[2].split(',').flatMap((id) => {
					const term = termName.get(id.trim());
					return term ? [term] : [];
				}),
				...(badge ? [decode(badge)] : [])
			],
			page: seg.match(/<a href="(https:\/\/www\.grovevc\.com\/portfolio\/[^"]+)"/)?.[1] ?? ''
		});
	}

	// the listing links only grove's own detail pages; the company site is the
	// web-link anchor on those. the site rate-limits bursts (the second batch
	// of 8 came back empty-handed), so crawl gently: small batches, a pause
	// between them, one retry on a refused response
	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += 4) {
		await Promise.all(
			entries.slice(i, i + 4).map(async ({ name, categories, page }) => {
				let url = page;
				if (page) {
					try {
						let detail = await fetch(page, { headers: { 'User-Agent': UA } });
						if (!detail.ok) {
							await new Promise((r) => setTimeout(r, 2000));
							detail = await fetch(page, { headers: { 'User-Agent': UA } });
						}
						if (detail.ok) {
							const site = (await detail.text()).match(
								/class="web-link[^"]*" href="(https?:\/\/[^"]+)"/
							)?.[1];
							if (site) url = site;
						}
					} catch {
						// keep the detail-page url
					}
				}
				companies.push({ name, category: categories.join(', '), url });
			})
		);
		await new Promise((r) => setTimeout(r, 1000));
	}

	return companies;
}
