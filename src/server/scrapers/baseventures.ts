import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.base.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a wall of logos, each opening a panel
// served in the page — the name, a line about the company, the fund it
// sits in ("Fund I", or two of them), its site, and the labels the tabs
// read: a sector ("Enterprise", "Modern Consumer", or "Other", which says
// nothing) with a finer one under it ("Process Automation", "Brands"),
// and "Exit" on the ones the fund is out of. the page carries the wall
// twice, once for all and once a sector, so a company's second panel is
// passed over.

const PANEL = /(?=<div\b[^>]*\bclass="lightbox w-clearfix")/;
const NAME = /class="company-name"[^>]*>([\s\S]*?)<\/h4>/;
const FUND = /class="company-fund"[^>]*>([\s\S]*?)<\/div>/;
// the labels shown; a hidden one ("Active") is the panel's own state
const LABEL = /class="company-details"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="company-url"/;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(PANEL).slice(1)) {
		// a panel ends at its description; the last runs on to the end of the page
		const panel = chunk.slice(0, chunk.indexOf('</p>') + 4 || undefined);
		const name = clean(panel.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = [...panel.matchAll(LABEL)].map(([, label]) => tag(label));
		const exited = labels.some((l) => /^exit(?:ed)?$/i.test(l));
		const site = unescape(panel.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...clean(panel.match(FUND)?.[1] ?? '')
					.split(',')
					.map((f) => tag(f)),
				...labels.filter((l) => !/^(?:exit(?:ed)?|other)$/i.test(l)),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('baseventures: no companies on the portfolio page');
	}

	return companies;
}
