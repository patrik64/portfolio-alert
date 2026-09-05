import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.primemoverslab.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-built bootstrap page: rows of tiles, each a link to the company
// wrapping its name and the line the fund uses to say what it is building —
// "Reliable Fixed Wireless Access", "Next Generation Radar". that line is the
// only thing the fund files a company under, so it is the category.
//
// the page runs the portfolio first with no heading over it, then a section
// headed "Public Companies / Exits". the heading is what marks a company as
// having gone public or been bought, so it is carried after the line, and the
// split is read from the headings themselves rather than a fixed count.

const SECTION = /<h2[^>]*class="section-title"[^>]*>([\s\S]*?)<\/h2>/g;
const CARD =
	/<a href="(https?:\/\/[^"]*)"[^>]*>([\s\S]{0,400}?)<\/a>/g;
const NAME = /<strong class="team-name">([\s\S]*?)<\/strong>/;
const SPEC = /<span class="team-spec">([\s\S]*?)<\/span>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a line the fund wrote with a comma in it
// would otherwise read as several tags
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// where each section starts, and what the fund calls it — the portfolio
	// itself runs before the first heading and is left unlabelled
	const sections: { at: number; label: string }[] = [{ at: 0, label: '' }];
	for (const m of html.matchAll(SECTION)) {
		sections.push({ at: m.index, label: tag(m[1]) });
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(CARD)) {
		const name = clean(m[2].match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const section = sections.filter((s) => s.at < m.index).pop();
		companies.push({
			name,
			category: [tag(m[2].match(SPEC)?.[1] ?? ''), section?.label ?? '']
				.filter(Boolean)
				.join(', '),
			url: m[1]
		});
	}

	if (companies.length === 0) {
		throw new Error('primemovers: no companies on the portfolio page');
	}

	return companies;
}
