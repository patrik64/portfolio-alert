import type { ScrapedCompany } from './types';

const SITE_URL = 'https://www.cherry.vc';
const PAGE_URL = `${SITE_URL}/founders`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the founders page renders every company twice: as a logo card (industry tag,
// EXIT badge, sometimes the company site in data-external-link, but no name)
// and as a text card (the name in an h3). both card types link the same
// /founder-companies/<slug> detail page, which joins them — and for companies
// neither card gives a site, the detail page carries it

interface Entry {
	name: string;
	url: string;
	categories: string[];
	exit: boolean;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const byHref = new Map<string, Entry>();
	const entryFor = (href: string): Entry => {
		let entry = byHref.get(href);
		if (!entry) {
			entry = { name: '', url: '', categories: [], exit: false };
			byHref.set(href, entry);
		}
		return entry;
	};

	for (const m of html.matchAll(
		/<a data-external-link="([^"]*)" href="(\/founder-companies\/[^"]+)" class="[^"]*card-item_home-founders[\s\S]*?<\/a>/g
	)) {
		const entry = entryFor(m[2]);
		if (!entry.url) entry.url = m[1];
		if (entry.categories.length === 0) {
			entry.categories = [...m[0].matchAll(/class="industry-text">([^<]*)</g)]
				.map((x) => decode(x[1]))
				.filter(Boolean);
		}
		entry.exit ||= m[0].includes('founders-list_exit');
	}

	for (const m of html.matchAll(
		/<a data-external-link="([^"]*)" href="(\/founder-companies\/[^"]+)" class="[^"]*founders-list_item[\s\S]*?<\/a>/g
	)) {
		const entry = entryFor(m[2]);
		const h3 = m[0].match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
		if (h3 && !entry.name) entry.name = decode(h3[1].replace(/<[^>]+>/g, ''));
		if (!entry.url) entry.url = m[1];
	}

	if (byHref.size === 0) {
		throw new Error('cherry: no companies found on the founders page');
	}

	// fill the gaps from the detail pages, in small batches: the company site
	// (a text-style-link anchor) and, rarely, a name via the page title
	const entries = [...byHref.entries()];
	for (let i = 0; i < entries.length; i += 8) {
		await Promise.all(
			entries.slice(i, i + 8).map(async ([path, entry]) => {
				if (entry.url && entry.name) return;
				try {
					const detail = await fetch(`${SITE_URL}${path}`, { headers: { 'User-Agent': UA } });
					if (!detail.ok) return;
					const page = await detail.text();
					if (!entry.url) {
						entry.url =
							page.match(/<a href="(https?:\/\/[^"]+)" class="text-style-link text-size-medium"/)?.[1] ??
							'';
					}
					if (!entry.name) {
						entry.name = decode(page.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
					}
				} catch {
					// the fallbacks below cover it
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	for (const [path, entry] of byHref) {
		// last resorts: the slug as the name, the detail page as the url
		const name =
			entry.name ||
			path
				.split('/')[2]
				.split('-')
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');
		companies.push({
			name,
			category: [...entry.categories, ...(entry.exit ? ['Exit'] : [])].join(', '),
			url: entry.url || `${SITE_URL}${path}`
		});
	}

	return companies;
}
