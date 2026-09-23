import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.illuminatefinancial.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the portfolio page lists every company as a collection item with
// the fund's themes for it, the region it works in and its status — "Active"
// or "Acquired" — but shows the company only as a logo, with no alt text and
// no name. each item links a page of the company's own, whose heading names it
// and whose "Website" link is its address; those pages are fetched in batches.
// a page that will not load leaves its company out for the night rather than
// guessing a name for it, and too many of them fail the fetch.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*collection-item)/;
const PAGE = /href="(\/portfolio\/[^"#?]+)"/;
const field = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([\\s\\S]*?)<\\/`, 'g');
const STATUS = field('Portfolio Status');
const REGION = field('Portfolio Geography');
const THEME = field('Portfolio themes');
const NAME = /<h3[^>]*class="name"[^>]*>([\s\S]*?)<\/h3>/;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?Website/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a theme holding a comma would read as two
// ("Private Markets, Wealth & Asset Management")
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => tag(m[1])).filter(Boolean);

// a link pasted from an email can arrive wrapped by the mail filter's redirect
// (canton's did); the address it carries is the company's
function address(href: string): string {
	const raw = unescape(href);
	try {
		const url = new URL(raw);
		if (url.hostname.endsWith('safelinks.protection.outlook.com')) {
			return url.searchParams.get('url') ?? raw;
		}
	} catch {
		// an address that will not parse is kept as the page wrote it
	}
	return raw;
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const listed = new Map<string, string>();
	for (const item of html.split(ITEM).slice(1)) {
		const page = item.match(PAGE)?.[1];
		if (page && !listed.has(page)) listed.set(page, item);
	}
	if (listed.size === 0) {
		throw new Error('illuminate: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const pages = [...listed];
	for (let i = 0; i < pages.length; i += BATCH_SIZE) {
		const batch = pages.slice(i, i + BATCH_SIZE);
		const details = await Promise.all(
			batch.map(([page]) => fetchText(`${BASE_URL}${page}`).catch(() => ''))
		);
		batch.forEach(([, item], j) => {
			const name = clean(details[j].match(NAME)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) return;
			seen.add(name.toLowerCase());
			const status = all(STATUS, item)[0] ?? '';
			companies.push({
				name,
				category: [
					...all(THEME, item),
					...all(REGION, item),
					/^active$/i.test(status) ? '' : status,
					/acquired/i.test(status) ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', '),
				url: address(details[j].match(SITE)?.[1] ?? '')
			});
		});
	}

	if (companies.length < listed.size * 0.9) {
		throw new Error(`illuminate: named ${companies.length} of the ${listed.size} companies listed`);
	}

	return companies;
}
