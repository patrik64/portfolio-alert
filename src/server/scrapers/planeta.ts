import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://planet-a.com/startups/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the startups page shows every company as a column, its name as
// the fund writes it, most in capitals ("ARIS MACHINA", "goodcarbon"), a
// line about it, the focus areas the page filters by ("Energy", "Resource
// Mastery"), kept as tags, and buttons to its site and to the fund's impact
// assessment of it. the site's button is mostly titled "Website" but not
// always, so it is told apart by leading off the fund's site. the columns
// still to be filled ("COMING SOON") are left out. nothing marks an exit.

const COLUMN = /(?=<div\s+class="startup_column\s)/;
const NAME = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const PILL = /class="label_pill\b[^"]*"\s*>([^<]*)</g;
const LINKS = /class="overlay_links\b[\s\S]*?(?=<\/div>)/;
const HREF = /<a\s+href="([^"]*)"/g;
const OWN_SITE = /^https?:\/\/(?:www\.)?planet-a\.com(?:[/?#]|$)/i;
const UNANNOUNCED = /^(?:coming soon|tba|stealth|unannounced)\b/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const column of html.split(COLUMN).slice(1)) {
		const name = clean(column.match(NAME)?.[1] ?? '');
		if (!name || UNANNOUNCED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site =
			[...(column.match(LINKS)?.[0] ?? '').matchAll(HREF)]
				.map(([, href]) => unescape(href).trim())
				.find((href) => /^https?:\/\//i.test(href) && !OWN_SITE.test(href)) ?? '';
		if (site) withSite++;
		companies.push({
			name,
			category: [...column.matchAll(PILL)]
				.map(([, pill]) => tag(pill))
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('planeta: no companies on the startups page — the markup moved');
	}
	// without the buttons every company would link the fund's page
	if (withSite === 0) {
		throw new Error("planeta: no company's column links its site — the markup moved");
	}

	return companies;
}
