import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.javelinvp.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole grid on the one page. every card links to the
// company's own address, files it under tags, and — for the ones the fund is
// out of — says who acquired it. the name is written only into the logo's
// filename, as "Default _ Name" or "Name Default" behind an upload hash, so
// that is where it is read from, with the link's domain as the fallback for
// a filename that says nothing.

const ITEM = 'company-item w-dyn-item';
const IMAGE = /src="([^"]+)"/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="company-item-link/;
const TAG = /class="company-tag">\s*<div>([^<]*)</g;
const STATUS = /item-type="([^"]+)"/;
const ACQUIRER = /acquired-by-wrp">[\s\S]*?<\/div>\s*<\/div>\s*<div>([^<]*)</;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;

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
	const parts = hostname.replace(/^www\./, '').split('.');
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

// the logo filename with the wall's own dressing taken off
const fileName = (src: string) =>
	decodeURIComponent(src.split('/').pop() ?? '')
		.replace(/^[0-9a-f]{16,}_/, '')
		.replace(/\.\w+$/, '')
		.replace(/\b(Default|Hover)\b/gi, '')
		.replace(/[_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const site = item.match(SITE)?.[1] ?? '';
		let name = fileName(item.match(IMAGE)?.[1] ?? '');
		if (!name && site) {
			try {
				name = domainLabel(new URL(site).hostname.toLowerCase());
			} catch {
				// the card stays nameless and is skipped below
			}
		}
		name = capitalize(clean(name));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const status = clean(item.match(STATUS)?.[1] ?? '');
		const acquirer = clean(item.match(ACQUIRER)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...[...item.matchAll(TAG)].map((m) => tag(m[1])),
				/acquired/i.test(status) ? `Acquired by ${acquirer}`.trim() : '',
				/acquired/i.test(status) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('javelin: no companies on the page');
	}

	return companies;
}
