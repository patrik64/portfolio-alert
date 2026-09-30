import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://crane.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft, a theme of its own: the portfolio page holds every company as a
// tile that opens a panel, and the panel is in the page, a template beside
// the tile — the name, a line about it, the stage the fund came in at, an
// exit told as "Exited" or "Exited to Collibra", and links to its site and
// its social pages. the tile itself carries the categories it is filed
// under as slugs, which the filters above the list spell out, and a mark on
// the ones the fund is out of. the filters run in the browser, so the page
// holds every tile. an exit's site is sometimes its buyer's, as the fund
// links it.

const ITEM = /(?=<li\s+data-portfolio-list-ref="items")/;
const CATEGORIES = /\bdata-portfolio-category="([^"]*)"/;
const EXITED = /\bdata-portfolio-company-exited="true"/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
// the labels of a panel, the stage and the exit, each after a coloured dot
const LABEL = /<p class="label-s\b[^"]*">([\s\S]*?)<\/p>/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const SOCIAL = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com)\//i;
// a category of the filter: its slug, and how it is spelled out
const FILTER = /<input\b[^>]*\bdata-portfolio-filter="([^"]+)"[^>]*\bvalue="([^"]*)"/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const spelled = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const opening = item.slice(0, item.indexOf('>') + 1);
		// the panel, where a label is written out in full
		const panel = item.slice(item.indexOf('<template'));
		const name = clean(panel.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = [...panel.matchAll(LABEL)].map((m) => tag(m[1])).filter(Boolean);
		const exited = EXITED.test(opening) || labels.some((label) => /^exited\b/i.test(label));
		companies.push({
			name,
			category: [
				// a slug the filters do not spell out is read as it stands
				...(opening.match(CATEGORIES)?.[1] ?? '')
					.split(',')
					.map((slug) => slug.trim())
					.filter(Boolean)
					.map((slug) => spelled.get(slug) ?? slug.replace(/-/g, ' ')),
				// the stage, then how the exit went where it says more than that
				// it happened: "Exited to Collibra"
				...labels,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: [...panel.matchAll(LINK)].map((m) => unescape(m[1])).find((link) => !SOCIAL.test(link)) ?? PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('crane: no companies on the portfolio page');
	}

	return companies;
}
