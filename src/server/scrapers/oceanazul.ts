import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://oceanazulpartners.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on divi, the whole portfolio served in the page. a company is a
// blurb: a logo, a heading naming it, and a line about what it does — and the
// heading is a link to the company's own site, so both the name and the
// address come off the one tag.
//
// the fund files nothing under a sector, a stage or a place, and the page is
// in two parts: "Active & Exited Portfolio", which says of a company only that
// it is one or the other and not which, and "Florida Focus Investments", which
// is the vehicle the fund bought through rather than anything about the
// company. so neither heading becomes a tag, and every company here is left
// with no category.
//
// the fund writes a few of the names in capitals — DIGBI HEALTH, SIMETRIC,
// 1TOUCH.IO — and they are left as it writes them, the way names are
// everywhere else.

const HEADING = /<h4 class="et_pb_module_header">([\s\S]*?)<\/h4>/g;
const LINK = /<a[^>]*\bhref="([^"]+)"/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, heading] of html.matchAll(HEADING)) {
		const name = clean(heading);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: '',
			url: clean(heading.match(LINK)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('oceanazul: no companies in the portfolio');
	}

	return companies;
}
