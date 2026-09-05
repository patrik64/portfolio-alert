import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.venturefriends.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;
const BATCH_SIZE = 20;

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the webflow portfolio is a finsweet list (fs-list-load="more") served nine
// cards per page via ?2556cbb6_page=N. the cards are logos only — no alt text,
// no name — so the company name comes from its detail page title
// ("Huspy | VentureFriends"), which also carries the outbound link plus the
// Location and Last funding round rows. the sector tags (and an Exited marker)
// ride along on the card as fs-list-field="domain" values. several outbound
// links are pasted from an ad click, so the query string is dropped; three
// companies link nowhere and fall back to the fund's own page.

interface Entry {
	slug: string;
	domains: string[];
	exited: boolean;
}

interface Detail {
	name: string;
	site: string;
	location: string;
	round: string;
}

async function fetchDetail(slug: string): Promise<Detail> {
	const detail: Detail = { name: '', site: '', location: '', round: '' };
	try {
		const resp = await fetch(`${BASE_URL}/portfolio-companies/${slug}`, {
			headers: { 'User-Agent': UA }
		});
		if (!resp.ok) return detail;
		const html = await resp.text();
		detail.name = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')
			.replace(/\s*\|\s*VentureFriends\s*$/i, '')
			.trim();
		// href="#" when the fund lists no site
		const href = decode(html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio-link-out/)?.[1] ?? '');
		detail.site = href.split(/[?#]/)[0];
		for (const m of html.matchAll(
			/class="text-size-large is-label">([^<]*)<\/h6><h6 class="text-size-large[^"]*">([^<]*)<\/h6>/g
		)) {
			const label = decode(m[1]).toLowerCase();
			if (label === 'location') detail.location = decode(m[2]);
			if (label === 'last funding round') detail.round = decode(m[2]);
		}
	} catch {
		// fall through with the listing data only
	}
	return detail;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const entries: Entry[] = [];
	const seen = new Set<string>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?2556cbb6_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		let found = 0;
		for (const item of html.split('class="portfolio-collection-item w-dyn-item"').slice(1)) {
			const card = item.split('class="portfolio-collection-item w-dyn-item"')[0];
			const slug = card.match(/href="\/portfolio-companies\/([^"]+)"/)?.[1];
			if (!slug || seen.has(slug)) continue;
			seen.add(slug);
			found++;
			const domains = [...card.matchAll(/fs-list-field="domain">([^<]*)</g)].map((m) => decode(m[1]));
			entries.push({
				slug,
				domains: domains.filter((d) => !/^exited$/i.test(d)),
				exited: domains.some((d) => /^exited$/i.test(d))
			});
		}
		// the last page still renders the pagination wrapper, so an empty page ends it
		if (found === 0) break;
	}
	if (entries.length === 0) {
		throw new Error('venturefriends: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const details = await Promise.all(batch.map((e) => fetchDetail(e.slug)));
		for (let j = 0; j < batch.length; j++) {
			const { slug, domains, exited } = batch[j];
			const { name, site, location, round } = details[j];
			// the slug would be a different name for the same company
			// ("thats-the-one" for "That's The One"), and a fetch that failed
			// once must not rename anyone into a phantom newcomer. the company
			// keeps the row an earlier fetch gave it
			if (!name) continue;
			// the round doubles as an exit note ("Exited to Meta 2022") — not a stage
			const stage = /^exited/i.test(round) ? '' : round;
			companies.push({
				name,
				category: [...domains, location, stage, exited || /^exited/i.test(round) ? 'Exited' : '']
					.filter(Boolean)
					.join(', '),
				url: site || `${BASE_URL}/portfolio-companies/${slug}`
			});
		}
	}

	return companies;
}
