import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.moc.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a table, the whole of it in the page, a row a
// company giving its name linking its site, a line about it, its
// headquarters ("Poland", "USA"), the year of investment — "2012 (Pre MOC
// Investment)" for the partners' cheques before the fund — its sector
// ("FinTech", "Logistics"), its co-founders and its status ("Active",
// "Unicorn", "Exit", "R.I.P."). the sector, the country and the year are
// kept as tags, an earlier cheque as "Pre MOC Investment", an exit with
// the Exited tag and a company gone with the Closed tag.
//
// a row now and then carries another's name — Arise and PetsApp were
// listed as "Asap.work" and "Routine", beside the companies of those names
// — while its page here keeps its own ("/portfolio/arise"). so where two
// rows share a name, the one whose page is not named for it is named for
// its page.

const ROW = /(?=<div\b[^>]*role="listitem" class="portfolio_collection w-dyn-item")/;
// the name, linking the company's site
const NAME = /<a fs-cmsfilter-field="company"[^>]*href="([^"]*)"[^>]*class="collection_link"[^>]*>([\s\S]*?)<\/a>/;
// the row's page here, named for the company
const PAGE = /<a fs-cmsfilter-field="company" href="\/portfolio\/([^"]+)" class="hide">/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const YEAR = /\b(?:19|20)\d{2}\b/;
const PRE_FUND = /\(\s*pre moc investment\s*\)/i;
const EXIT = /^exit(?:ed)?$/i;
const GONE = /^r\.?i\.?p\.?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// "petsapp" -> "Petsapp", "asap-work" -> "Asap Work"
const inWords = (s: string) =>
	s
		.split(/[-_]+/)
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const rows = html.split(ROW).slice(1);
	const written = rows.map((row) => clean(row.match(NAME)?.[2] ?? ''));
	const shared = (name: string) => written.filter((w) => w.toLowerCase() === name.toLowerCase()).length > 1;

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	rows.forEach((row, i) => {
		const href = row.match(NAME)?.[1] ?? '';
		const page = row.match(PAGE)?.[1] ?? '';
		// a name borrowed from another row gives way to the row's page
		const name =
			written[i] && page && shared(written[i]) && !spelled(page).startsWith(spelled(written[i]))
				? inWords(page)
				: written[i];
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		const field = (key: string) => clean(row.match(FIELD(key))?.[1] ?? '');
		const when = field('year');
		const year = when.match(YEAR)?.[0];
		const status = field('status');
		const site = unescape(href).trim();
		companies.push({
			name,
			category: [
				tag(field('sector')),
				tag(field('country')),
				year ? `Invested ${year}` : '',
				PRE_FUND.test(when) ? 'Pre MOC Investment' : '',
				EXIT.test(status) ? 'Exited' : '',
				GONE.test(status) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	});

	if (companies.length === 0) {
		throw new Error('marketone: no companies in the portfolio table — the markup moved');
	}

	return companies;
}
