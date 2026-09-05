import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.psv.xyz';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 30;

// static webflow with a finsweet list over it. the page shows twenty-five
// companies at a time behind a "load more"; webflow still serves the rest at
// the paging parameter the next link names, so the pages are walked until one
// comes back empty. the category filter in the url is applied in the browser,
// so the unfiltered page already carries everything.
//
// a card is a logo with no alt text, the fund's category, a link to the
// company, and a line about what it does. no name anywhere — so the name comes
// from the company's own domain, with the logo's filename allowed to correct
// it where the two agree, as rtp global's does. the filename wins outright
// when there is no link.
//
// one company is linked to a news story about it being bought rather than to
// itself, so a handful of publishers are barred from naming a company; there
// the filename does it, and the fund's link is kept as published.
//
// six cards are a placeholder logo with no link — companies in stealth, three
// of them sharing one "Group 3671" image. there is no name to file them
// under, so they are left out until the fund says who they are.

const ITEM = 'role="listitem" class="collection-item w-dyn-item">';
const NEXT = /href="\?([a-z0-9_]+_page)=(\d+)" aria-label="Next Page"/;
const CATEGORY = /fs-list-field="category">([^<]*)</;
const LOGO = /src="([^"]*)"[^>]*class="logo-image"/;
const SITE = /href="([^"]*)" class="company-link pop-up/;
// what a logo file is called besides the company, in danish as well as english
const DRESSING =
	/^(?:logos?|logotype|wordmark|brandmark|icon|primary|primarylogo|header|black|white|blue|green|red|lightpink|dark|light|final|new|larger?|small|medium|copy|kopi|stor|pos|colou?rs?|transparent|accent|full|horizontal|lockup|removebg|preview|prev|screenshot|skaermbillede|kl|rgb|gr|blk|pdf|png|jpe?g|svg|webp|group|[\d.]+|\d+px|\d+x\d*|[0-9a-f]{8,})$/i;
// the same word run onto the end of the company, as "Obital.Logo" is
const DRESSING_SUFFIX = /[.\s-]*logos?$/i;
// hosts that carry a story about a company rather than being the company
const PUBLISHER =
	/(venturebeat|techcrunch|medium\.com|linkedin|crunchbase|wikipedia|forbes|bloomberg|reuters)/i;
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|dk|no|se|da|app|shop|about|info|my)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const HASH_PREFIX = /^[0-9a-f]{18,}[-_]/;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// a dot inside a name is the company's own, as alice.tech is, so only the
// separators around it are split on
const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function fromFile(file: string): string {
	return file
		.split(/[-_\s]+/)
		.map((w) => w.replace(/^\.+|\.+$/g, ''))
		.filter(Boolean)
		.map((w) => w.replace(DRESSING_SUFFIX, '') || w)
		.filter((w) => w && !DRESSING.test(w))
		.join(' ');
}

function domainParts(url: string): { label: string; ending: string } {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return { label: '', ending: '' };
	}
	if (PUBLISHER.test(hostname)) return { label: '', ending: '' };
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return { label: parts[0] ?? '', ending: '' };
	const ending = parts[parts.length - 1];
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) {
		return { label: parts[parts.length - 3], ending };
	}
	return { label: parts[parts.length - 2], ending };
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	// the paging parameter carries a hash webflow regenerates, so it is read
	// off the first page's next link rather than written down here
	let param = '';
	let page = 1;

	for (let n = 0; n < MAX_PAGES; n += 1) {
		const html = (await fetchText(param ? `${PAGE_URL}?${param}=${page}` : PAGE_URL)).replace(
			/\s+/g,
			' '
		);
		const items = html.split(ITEM).slice(1);
		if (items.length === 0) break;

		for (const item of items) {
			const href = clean(item.match(SITE)?.[1] ?? '');
			const site = href.startsWith('http') ? href : '';
			const { label, ending } = domainParts(site);

			const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
				.replace(/\.\w+$/, '')
				.replace(HASH_PREFIX, '');
			const fileKey = key(fromFile(file));
			const labelKey = key(label);

			let name: string;
			if (!labelKey) {
				name = capitalize(fromFile(file));
			} else if (fileKey && (fileKey === labelKey || fileKey === labelKey + key(ending))) {
				name = capitalize(fromFile(file));
			} else {
				name = capitalize(label);
			}
			if (!name || seen.has(name)) continue;
			seen.add(name);

			companies.push({
				name,
				category: clean(item.match(CATEGORY)?.[1] ?? ''),
				url: site
			});
		}

		const next = html.match(NEXT);
		if (!next) break;
		param = next[1];
		page = Number(next[2]);
	}

	if (companies.length === 0) {
		throw new Error('psv: no companies on the portfolio page');
	}

	return companies;
}
