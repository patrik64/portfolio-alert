import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.superangel.vc';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 30;
const BATCH_SIZE = 10;

// webflow, the portfolio paginated across the fund's own home page. nowhere on
// that page is a company's name written as text: the tiles are logos with
// empty alt attributes, linking out to the company and in to a stub page that
// holds nothing but the categories.
//
// so a name has to be assembled. the item's own slug begins with it —
// "arber-all-natural-lawn-garden-plant-care-brand" — and the company's own
// hostname says where the name stops: the longest run of leading slug words
// that the hostname contains is the name, which finds Arber in growarber.com
// and Flex Storage in flex.storage.
//
// that gives the words but not their casing, so two sources supply it: the
// alt text of the eighteen companies the fund features in its slider, which is
// the only place it writes names properly, and otherwise the logo's filename
// where it spells the same letters — PostPilot.svg, HNY__Primary_Logo.png.
//
// two names are imperfect and stay that way: "big-sur-ai-ai-tools-for-commerce"
// links to a businesswire press release rather than the company, and
// "tvads-ai-performance-tv-marketing-platform" to upscale.ai, so neither
// hostname can say where the name ends and the first word is all that is safe.
//
// the categories live on the stub pages, one fetch each — the fund's own page
// does the same, which is what those stubs are for. four of them name a sector
// and one records an exit; the rest say which of the fund's vehicles holds the
// company, which is not about the company.

const ITEM =
	/<div[^>]*class="portfolio_item w-dyn-item">([\s\S]*?)(?=<div[^>]*class="portfolio_item w-dyn-item">|<div role="navigation")/g;
const SLUG = /href="\/portfolio\/([^"]+)"/;
const LOGO = /<img[^>]*src="([^"]+)"[^>]*class="portfolio_image"/;
const SITE = /aria-label="click to open portfolio site" href="(https?:\/\/[^"]+)"/;
const NEXT = /<a href="\?([^"]+)"[^>]*class="w-pagination-next portfolio_pagination-button"/;
const FEATURED = /class="slider_popup-content-right-image-wrapper"><img[^>]*alt="([^"]+)"/g;
const CATEGORY = /href="\/portfolio-category\/[^"]*" class="w-inline-block"><div>([^<]*)</g;
// which of the fund's vehicles wrote the cheque is not a fact about a company
const VEHICLE = /^(all|fund [ivx]+|first checks)$/i;
const HASH = /^[0-9a-f]{18,}_/;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
	} catch {
		return '';
	}
};

// "ai" is a word the fund writes as AI, and title case would not
const titleCase = (words: string[]) =>
	words
		.map((w) => (/^ai$/i.test(w) ? 'AI' : w.charAt(0).toUpperCase() + w.slice(1)))
		.join(' ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

interface Item {
	slug: string;
	logo: string;
	site: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const items: Item[] = [];
	const bySlug = new Set<string>();
	const featured = new Map<string, string>();

	let next: string | null = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && next; page++) {
		const html: string = await fetchText(next);
		for (const m of html.matchAll(FEATURED)) {
			const alt = clean(m[1]);
			if (alt) featured.set(key(alt), alt);
		}
		for (const m of html.matchAll(ITEM)) {
			const slug = m[1].match(SLUG)?.[1];
			if (!slug || bySlug.has(slug)) continue;
			bySlug.add(slug);
			items.push({
				slug,
				logo: m[1].match(LOGO)?.[1] ?? '',
				site: m[1].match(SITE)?.[1] ?? ''
			});
		}
		const query = html.match(NEXT)?.[1];
		next = query ? `${PAGE_URL}?${query}` : null;
	}

	if (items.length === 0) {
		throw new Error('superangel: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const slugs: string[] = [];
	for (const item of items) {
		const words = item.slug.split('-');
		const host = key(hostOf(item.site));
		// the longest run of leading words the company's own hostname carries
		let taken = 1;
		if (host) {
			for (let i = words.length; i > 0; i--) {
				if (host.includes(key(words.slice(0, i).join('')))) {
					taken = i;
					break;
				}
			}
		} else if (words.length === 1) {
			taken = 1;
		}
		const base = words.slice(0, taken);
		const k = key(base.join(''));

		let name = featured.get(k) ?? '';
		if (!name) {
			const file = decodeURIComponent(item.logo.split('/').pop() ?? '')
				.replace(HASH, '')
				.replace(/\.\w+$/, '');
			for (const m of file.matchAll(/[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*/g)) {
				if (key(m[0]) === k) {
					name = m[0].replace(/[_-]/g, ' ');
					break;
				}
			}
		}
		if (!name) name = titleCase(base);

		if (!name || seen.has(name)) continue;
		seen.add(name);
		slugs.push(item.slug);
		companies.push({ name, category: '', url: item.site });
	}

	// the stub page behind each tile is where the categories are kept
	for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
		const batch = slugs.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((slug) => fetchText(`${BASE_URL}/portfolio/${slug}`).catch(() => ''))
		);
		pages.forEach((page, j) => {
			const tags = [...page.matchAll(CATEGORY)]
				.map((m) => clean(m[1]))
				.filter((t) => t && !VEHICLE.test(t));
			companies[i + j].category = [...new Set(tags)].join(', ');
		});
	}

	return companies;
}
