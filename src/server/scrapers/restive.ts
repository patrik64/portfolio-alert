import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.restive.com/our-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the whole portfolio one collection list of logos. what a
// company gets is a logo, a link to itself and — for a sixth of them — a word
// for how the investment ended. no names: the alt text is empty on all
// seventy-one, the collection has no template page, and the sitemap confirms
// it, so there is nowhere on the site the fund writes a company down.
//
// the name is therefore assembled from the company's own domain and the logo's
// filename, as rtp's is. the domain is the steadier of the two — a fifth of
// the filenames are "ChatGPT Image Aug 14, 2026" or "Group 9" or a size in
// pixels — but it is often the brand with a verb stuck on the front
// (getcopper.com, useanvil.com, joinharvest.com, workwithcanary.com) or a
// trade on the back (lunchpayments.com, standinsurance.com, snoutid.com). the
// fund's own file naming is "<Brand> Block Logo.png", so where the filename
// spells a piece of the domain it is the brand and the rest is decoration;
// where the two agree outright the filename wins for its capitals, which is
// the only thing that tells BlueQubit from bluequbit.
//
// a filename that spells the domain including its ending names the company
// when the ending is a word the brand uses — atlas.health is Atlas Health, and
// distinct from the two other Atlases here — but an ending that is only an
// address (.ai, .io) is dropped, so glade.ai stays Glade. anything else the
// filename adds is the fund's own note about the file ("point home logo"), not
// the company, and the domain wins.

const ITEM = '<div role="listitem" class="collection-item-2 w-dyn-item w-col w-col-3">';
const SITE = /<a href="([^"]*)"/;
const LOGO = /<img[^>]*src="([^"]+)"/;
const TAG = /class="text-block-tag[^"]*">([^<]*)</;
// what a logo file is called besides the company
const DRESSING =
	/^(?:logos?(?:white|black|dark|light)?|logotype|wordmark|block|new|actual|final|main|full|horizontal|vertical|transparent|minimalist|design|preview|chatgpt|image|screenshot|group|home|white|whitebg|black|noir|dark|light|colou?rs?|coloured?|smaller|shrunk|cropped|small|large|square|icon|png|jpe?g|svg|am|pm|jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|\d+|\d+x\d+|\d*pct|[0-9a-f]{8,})$/i;
// verbs a fintech puts in front of its brand to get a free .com
const DECORATION = ['workwith', 'goto', 'get', 'try', 'use', 'join', 'with', 'work', 'go', 'my'];
// domain endings that are an address rather than part of the brand
const ADDRESS = /^(?:ai|io|co|so|app|xyz|com|net|org|dev|me)$/i;
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|sg|in|corp|shop|about|info)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
// webflow prefixes every upload with an id, and a re-upload prefixes it again
const HASH_PREFIX = /^[0-9a-f]{18,}[-_]/;
// a filename that carries the name the company traded under before
const FORMERLY = /\b(?:f\.?k\.?a\.?|formerly)\b[\s_-]+(.+)$/i;
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
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// the words of a filename that are the company, with the fund's notes about
// the file itself thrown away
function words(file: string, ending: string): string {
	let parts = file.split(/[^A-Za-z0-9]+/).filter(Boolean);
	if (ADDRESS.test(ending)) parts = parts.filter((w) => w.toLowerCase() !== ending);
	// a trailing count ("hiro2", "white1") only survives the first pass
	parts = parts.filter((w) => !DRESSING.test(w)).map((w) => w.replace(/\d+$/, '') || w);
	return parts.filter((w) => !DRESSING.test(w)).join(' ');
}

function domainLabel(hostname: string): { label: string; ending: string } {
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return { label: parts[0] ?? '', ending: '' };
	const ending = parts[parts.length - 1];
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) {
		return { label: parts[parts.length - 3], ending };
	}
	return { label: parts[parts.length - 2], ending };
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
		const href = clean(item.match(SITE)?.[1] ?? '');
		const site = href.startsWith('http') ? href : '';

		let label = '';
		let ending = '';
		let hostname = '';
		if (site) {
			try {
				hostname = new URL(site).hostname.toLowerCase();
				({ label, ending } = domainLabel(hostname));
			} catch {
				hostname = '';
			}
		}
		const bare = DECORATION.find(
			(d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND
		);
		if (bare) label = label.slice(bare.length);

		let file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '').replace(
			/\.\w+$/,
			''
		);
		while (HASH_PREFIX.test(file)) file = file.replace(HASH_PREFIX, '');
		const fromFile = words(file, ending);

		const fileKey = key(fromFile);
		const labelKey = key(label);
		let name: string;
		if (!labelKey) {
			name = capitalize(fromFile);
		} else if (
			fileKey &&
			(fileKey === labelKey ||
				fileKey === labelKey + key(ending) ||
				(fileKey.length >= MIN_BRAND && labelKey.includes(fileKey)))
		) {
			name = capitalize(fromFile);
		} else {
			name = capitalize(label);
		}

		// two companies the fund shows under one brand are told apart by their
		// addresses rather than one of them being dropped
		for (const fallback of [capitalize(label), hostname]) {
			if (!name || seen.has(name)) name = fallback;
		}
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const former = file.match(FORMERLY)?.[1] ?? '';
		companies.push({
			name,
			category: [former ? `f/k/a ${capitalize(words(former, ending))}` : '', clean(item.match(TAG)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('restive: no companies on the portfolio page');
	}

	return companies;
}
