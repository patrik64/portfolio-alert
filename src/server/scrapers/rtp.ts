import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://rtp.vc/our-companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. every company has a popup holding the year the fund invested, its
// sector, whether it sells to businesses or people, its country, the round the
// fund came in at, whether it is still live, and a link to it. what the popup
// never holds is the company's name.
//
// so the name is assembled from the company's own domain and the logo's
// filename. the domain is the steadier of the two — a third of the filenames
// are "Adobe-Express-file-8" or a screenshot's timestamp — but it is often the
// brand with something stuck to it: ridebeam.com, getphyllo.com, koloapp.in,
// sliceit.com. where the filename spells a piece of the domain, it is the
// brand and the rest is decoration, so the filename wins; where the two agree
// outright it wins too, for its capitals.
//
// four companies have no link. three are named by their filenames, and the
// fourth is on the play store, where the package id names it.

const ITEM = /(?=<div class="customer )/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*>Website<\/a>/;
const LOGO = /class="attachment-post-thumbnail[^"]*"[^>]*data-src="([^"]+)"/;
const FIELD = (cls: string) =>
	new RegExp(`class="${cls}">\\s*<p>[\\s\\S]*?<h5>([^<]*)</h5>`);
// what a logo file is called besides the company
const DRESSING =
	/^(logos?|logotype|wordmark|coloured?|colou?rs?|white|black|final|full|horizontal|vertical|transparent|screenshot|adobe|express|file|removebg|remove|background|preview|proj|project|light|dark|rtp|wine|pdf|main|example|images?|untitled|design|new|at|png|jpe?g|svg|\d+|[0-9a-f]{8,})$/i;
// hosts that carry a company rather than being one
const STORE = /^(play\.google|apps\.apple|linkedin|twitter|facebook|crunchbase|medium)\./i;
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|sg|in|corp|hp|shop|about|info)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const TIMESTAMP = /\b\d{4}-\d{2}-\d{2}[-\d]*\b/g;
const HASH_PREFIX = /^[0-9a-f]{18,}[-_]/;
// "Live" is what a company still held reads
const HELD = /^live$/i;
const MIN_BRAND = 3;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^ai$/i.test(w) ? 'AI' : /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(hostname: string): string {
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
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
		const site = clean(item.match(SITE)?.[1] ?? '');

		let label = '';
		let onStore = false;
		if (site) {
			try {
				const parsed = new URL(site);
				onStore = STORE.test(parsed.hostname);
				label = onStore
					? (parsed.searchParams.get('id') ?? '').split('.')[0]
					: domainLabel(parsed.hostname.toLowerCase());
			} catch {
				label = '';
			}
		}

		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(/\.\w+$/, '')
			.replace(HASH_PREFIX, '')
			.replace(TIMESTAMP, '');
		const fromFile = file
			.split(/[^A-Za-z0-9]+/)
			.filter((w) => w && !DRESSING.test(w))
			.map((w) => w.replace(/\d+$/, '') || w)
			.join(' ');

		const fileKey = key(fromFile);
		const labelKey = key(label);
		let name: string;
		if (onStore || !labelKey) {
			name = capitalize(fromFile) || capitalize(label);
		} else if (fileKey && (fileKey === labelKey || (fileKey.length >= MIN_BRAND && labelKey.includes(fileKey)))) {
			// the filename spells the brand the domain has dressed up
			name = capitalize(fromFile);
		} else {
			name = capitalize(label);
		}

		if (!name || seen.has(name)) continue;
		seen.add(name);

		const status = clean(item.match(FIELD('company-status'))?.[1] ?? '');
		companies.push({
			name,
			category: [
				clean(item.match(FIELD('company-sector'))?.[1] ?? ''),
				clean(item.match(FIELD('company-country'))?.[1] ?? ''),
				clean(item.match(FIELD('company-stage'))?.[1] ?? ''),
				HELD.test(status) ? '' : status
			]
				.filter(Boolean)
				.join(', '),
			url: onStore ? '' : site
		});
	}

	if (companies.length === 0) {
		throw new Error('rtp: no companies on the portfolio page');
	}

	return companies;
}
