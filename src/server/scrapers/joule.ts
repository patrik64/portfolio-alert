import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.joulevc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole grid on the one page. every card links to the
// company's own address and files it under category tags, but never names
// it — the logo's alt is empty — so the name comes from that domain, with
// the logo's filename allowed to correct the spacing and capitals where it
// spells the domain out, the way long journey's wall is read.

const ITEM = 'c-block-item portfolio w-dyn-item';
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="c-block-link/;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([^<]+)</g;
const IMAGE = /src="([^"]+)"/;
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
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();
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

// the words the filename opens with, if together they spell the domain
function spelledOut(file: string, label: string): string {
	const words = file.split(/[^A-Za-z0-9]+/).filter(Boolean);
	let spelled = '';
	for (let i = 0; i < words.length; i += 1) {
		spelled += key(words[i]);
		if (spelled === label) return words.slice(0, i + 1).join(' ');
		if (!label.startsWith(spelled)) break;
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const site = item.match(SITE)?.[1];
		if (!site) continue;
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

		const file = decodeURIComponent(item.match(IMAGE)?.[1]?.split('/').pop() ?? '')
			.replace(/\.\w+$/, '')
			.replace(/^[0-9a-f]{16,}_/, '')
			.replace(/[-_+]+/g, ' ');
		companies.push({
			name: capitalize(spelledOut(file, label) || label),
			category: [...new Set([...item.matchAll(CATEGORY)].map((m) => tag(m[1])))].join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('joule: no companies on the portfolio page');
	}

	return companies;
}
