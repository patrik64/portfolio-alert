import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.intelcapital.com/portfolio/';
const AJAX_URL = 'https://www.intelcapital.com/wp-admin/admin-ajax.php';
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the whole list server-rendered: every entry is a list item
// whose classes file the company under a sector and a region, with the name
// in its title span. the company's own address lives in the popup admin-ajax
// serves per post id — to a request that says it is an xhr, which is all the
// "direct access" guard checks — so those are fetched in batches after.

const ITEM = /<li class="company ([a-z-]+) ([a-z-]+)" data-post-id="(\d+)"[\s\S]*?class="company-title">([^<]*)</g;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the popup's own furniture: anything here is not the company's address
const NOISE = /intelcapital|intel\.com|linkedin|twitter|facebook|youtube|instagram/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// "north-america" the class becomes "North America" the tag
const label = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const items = [...html.matchAll(ITEM)].map(([, sector, region, id, name]) => ({
		sector,
		region,
		id,
		name: clean(name)
	}));
	if (items.length === 0) {
		throw new Error('intelcapital: no companies on the portfolio page');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		await Promise.all(
			items.slice(i, i + BATCH_SIZE).map(async (item) => {
				try {
					const modal = await fetch(AJAX_URL, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'X-Requested-With': 'XMLHttpRequest',
							Referer: PAGE_URL,
							'User-Agent': UA
						},
						body: `action=portfolio_modal&post_id=${item.id}`
					});
					const body = await modal.text();
					const site = [...body.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(item.id, site);
				} catch {
					// the list already names the company; it just goes without its address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (!item.name || seen.has(item.name.toLowerCase())) continue;
		seen.add(item.name.toLowerCase());
		companies.push({
			name: item.name,
			category: [label(item.sector), label(item.region)].filter(Boolean).join(', '),
			url: sites.get(item.id) ?? ''
		});
	}

	return companies;
}
