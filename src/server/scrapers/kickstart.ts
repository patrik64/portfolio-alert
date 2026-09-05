import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://kickstart.com/portfolio';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, paginated the way northzone's is. each card carries industries, a
// stage, a website, a founding year, a location and a description — but
// never the company's name: the logo's alt is empty and no text says it. so
// the name comes from the website's domain, the way long journey's wall is
// read, and a card without a website cannot be named and is left out.

const ITEM = 'portfolio-cms-item w-dyn-item';
const SITE = /Website<\/div>\s*<a [^>]*href="(https?:\/\/[^"]+)"/;
const LOCATION = /Location<\/div>\s*<div>([^<]*)</;
const INDUSTRY = /fs-cmsfilter-field="industries"[^>]*>([^<]*)</g;
const STAGE = /fs-cmsfilter-field="stages"[^>]*>([^<]*)</g;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;

// verbs a company puts in front of its brand to get a free .com
const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'trust', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|sg|in|corp|shop|about|info|site|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(hostname: string): string {
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let next: string | null = PAGE_URL;

	for (let page = 0; next && page < MAX_PAGES; page++) {
		const html: string = await fetchPage(next);
		let found = 0;
		for (const item of html.split(ITEM).slice(1)) {
			const site = item.match(SITE)?.[1];
			if (!site) continue;
			found++;
			let label: string;
			try {
				label = domainLabel(new URL(site).hostname.toLowerCase());
			} catch {
				continue;
			}
			const bare = DECORATION.find(
				(d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND
			);
			if (bare) label = label.slice(bare.length);
			if (!label || seen.has(label)) continue;
			seen.add(label);

			const tags = new Set(
				[
					...[...item.matchAll(INDUSTRY)].map((m) => tag(m[1])),
					tag(item.match(LOCATION)?.[1] ?? ''),
					...[...item.matchAll(STAGE)].map((m) => tag(m[1]))
				].filter(Boolean)
			);
			companies.push({
				name: capitalize(label),
				category: [...tags].join(', '),
				url: site
			});
		}
		if (found === 0) {
			throw new Error(`kickstart: ${next} listed no companies`);
		}
		const query = html.match(NEXT)?.[1];
		next = query ? `${PAGE_URL}${query}` : null;
	}
	if (next) {
		throw new Error(`kickstart: the portfolio still paginated after ${MAX_PAGES} pages`);
	}
	if (companies.length === 0) {
		throw new Error('kickstart: no companies in the portfolio');
	}

	return companies;
}
