import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.recursiveventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with a divi icon-box grid on the fund's one page. a box carries a
// logo, the sectors the company works in, and a badge if it has exited or gone
// public — but no name, and the logos have no alt text. the boxes are not
// links either: divi keeps the addresses in a json map beside the page, keyed
// by the box's own class, which is how a box is matched to its company.
//
// the name comes from the logo's filename. most are the company's own slug,
// but six are "Untitled-design-1" or a bare hash, and for those the domain
// names the company instead.
//
// the domain is taken as it stands rather than having a leading "get" or "try"
// pulled off it, except where that verb is unmistakable — goliathdata.com is
// not a company called Liath.
//
// the fund says it has backed over a hundred companies and shows sixty of
// them, which is what "some of our portfolio companies" above the grid means.

const ITEM =
	/class="et_pb_module ba_icon_box (ba_icon_box_\d+) et_clickable"[\s\S]*?<div class="dtq-module dtq-module-parent dtq-iconbox">([\s\S]*?)<h3 class="dtq-iconbox__title">([^<]*)<\/h3>/g;
const CLICK = /\{"class":"(ba_icon_box_\d+)","url":"([^"]*)"/g;
const LOGO = /class="dtq-icon-image" src="([^"]*)"/;
const BADGE = /dtq-iconbox__badge">\s*([^<]*?)\s*<\/div>/;
// what a logo file is called besides the company
const DRESSING =
	/^(?:logos?|logotype|wordmark|icon|white|black|dark|light|final|copy|new|design|untitled|rgb|horizontal|vertical|transparent|\d+|[0-9a-f]{8,}|[A-Za-z0-9]{20,})$/i;
// the same words run onto the end of the company, as "tomatologowhite" is
const DRESSING_SUFFIX = /(?:logowhite|logoblack|logo|white|black)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// verbs a company puts in front of its brand to get a free domain. "go" is not
// among them: too many brands open with it for stripping it to be safe
const DECORATION = ['lets', 'goto', 'get', 'try', 'use', 'join', 'with', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|corp|shop|about|info)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// a dot inside a name is the company's own, as placer.ai is, so only the
// separators around it are split on
const capitalize = (s: string) =>
	s
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function fromFile(file: string): string {
	if (UUID.test(file)) return '';
	const words = file
		.split(/[-_\s]+/)
		// a hash the cms hung on the end of a word
		.map((w) => w.replace(/\.[0-9a-f]{8,}$/i, ''))
		.map((w) => w.replace(DRESSING_SUFFIX, '') || w)
		.filter((w) => w && !DRESSING.test(w));
	return words.join(' ');
}

function domainLabel(url: string): string {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
	if (hostname.includes('recursiveventures')) return '';
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	let label =
		parts.length < 2
			? (parts[0] ?? '')
			: parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
				? parts[parts.length - 3]
				: parts[parts.length - 2];
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const links = new Map(
		[...html.matchAll(CLICK)].map((m) => [m[1], m[2].replace(/\\\//g, '/')] as [string, string])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const site = links.get(m[1]) ?? '';
		const file = decodeURIComponent(m[2].match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(/\.(png|jpe?g|webp|svg|gif|avif)$/i, '')
			.replace(/_+$/, '');
		const name = capitalize(fromFile(file)) || capitalize(domainLabel(site));
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const badge = clean(m[2].match(BADGE)?.[1] ?? '');
		companies.push({
			name,
			category: [clean(m[3]), badge].filter(Boolean).join(', '),
			// two companies that were bought point back at the fund's own page
			url: domainLabel(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('recursive: no companies on the portfolio page');
	}

	return companies;
}
