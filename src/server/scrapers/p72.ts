import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://p72.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the fund's own theme. the whole portfolio is served in one
// page: a row per company that opens into a panel with a paragraph, where it
// was founded and a link to it. the filters above the list are client-side, so
// nothing has to be asked for a second time.
//
// the fund files a company under what it calls its focus — "Digital assets",
// "Micro-investing" — which is nearly one per company rather than a shared
// taxonomy, and under the stage it first invested at.
//
// the Active / Exited toggle is data-active on the row, and the forty-three
// exited ones are the rows the page starts with hidden. that is the only place
// an exit is recorded as a field: the panel says who bought the company, but
// only in prose. so "Exited" goes last, after the focus and the stage, and who
// bought it is left to the fund's own page.

const ROW = /class="c-portfolio__accordion[ "]/g;
// the row's status is an attribute of the tag the row is found by
const HELD = /^class="c-portfolio__accordion[^>]*data-active="1"/;
const NAME = /<h3>([^<]*)<\/h3>/;
const FOCUS = /class="c-portfolio__disrupting">\s*<span>([^<]*)<\/span>/;
const STAGE = /class="c-portfolio__investment">\s*<span>([^<]*)<\/span>/;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="o-button o-button--external"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a focus the fund wrote with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const starts = [...html.matchAll(ROW)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const row = html.slice(at, starts[i + 1] ?? html.length);

		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				tag(row.match(FOCUS)?.[1] ?? ''),
				tag(row.match(STAGE)?.[1] ?? ''),
				HELD.test(row) ? '' : 'Exited'
			]
				.filter(Boolean)
				.join(', '),
			url: row.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('p72: no companies on the portfolio page');
	}

	return companies;
}
