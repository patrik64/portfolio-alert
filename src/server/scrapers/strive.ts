import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://strive.vc/en/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the page files every company by region and marks the ones that
// have exited, but it never writes a name: the logos carry empty alt text, and
// a third of the filenames are in japanese or are "portfolio_logo27".
//
// so the company's own domain names it, and the logo's filename is used only
// for its capitals, and only where it spells the same thing the domain does —
// which is what turns superk into SuperK and youtrust into YOUTRUST.
//
// where a company's domain is not its brand the domain is what gets recorded:
// magicpod is filed under its parent's trident-qa.com, and cover under
// cover-corp.jp. that is the fund's own trail and it is stable, which matters
// more here than being pretty.

const ITEM = '<div class="item fadein-up"';
const AREA = /data-area="([^"]*)"/;
const EXITED = /data-exit="([^"]*)"/;
const LOGO = /<img src="([^"]+)"/;
const SITE = /<li class="web"><a href="(https?:\/\/[^"]+)"/;

// what a logo file is called besides the company
const DRESSING =
	/^(logos?\d*|logotype|wordmark|mark|final|new|web|white|black|colou?r|transp|transparent|horizontal|vertical|port|cover|ccover|bg|for|small|large|png|jpe?g|type|portfolio|catch|dark|light|\d+x\d+|e?\d+|[0-9a-f]{8,})$/i;
// subdomains that host a company rather than naming one
const SUBDOMAIN = /^(www|corp|hp|shop|about|company|info|jp|en|ja)$/i;
// second-level domains that are part of the suffix, as in co.jp
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

// the label of a company's domain that names it
function domainLabel(url: string): string {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

const region = (area: string) =>
	capitalize(area.replace(/[_-]+/g, ' ').trim())
		.split(' ')
		.map((w) => (w.toLowerCase() === 'asia' ? 'Asia' : w))
		.join(' ');

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
		const label = domainLabel(site);
		if (!label) continue;

		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '').replace(
			/\.\w+$/,
			''
		);
		const words = file
			.split(/[^A-Za-z0-9]+/)
			.filter((w) => w && !DRESSING.test(w))
			.map((w) => w.replace(/\d+$/, ''))
			.filter(Boolean);

		// the filename only gets to name the company when it agrees with the
		// domain; then it supplies both the capitals and the word breaks
		const name =
			words.length && key(words.join('')) === key(label)
				? capitalize(words.join(' '))
				: capitalize(label.replace(/-+/g, ' '));

		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [region(item.match(AREA)?.[1] ?? ''), item.match(EXITED)?.[1] ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('strive: no companies on the portfolio page');
	}

	return companies;
}
