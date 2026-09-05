import type { ScrapedCompany } from './types';

const RESULTS_URL = 'https://kindredventures.com/portfolio?sf_data=results&sf_paged=';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress behind the search & filter plugin, whose results endpoint pages
// the portfolio a couple dozen companies at a time under an infinite scroll.
// every company arrives as a popup that names it, links its own address, and
// carries its country and the fund's missions for it — the ones past the
// first tucked into a tooltip. the pages are walked until one brings nobody
// new, at a reader's pace: the site answers 429 when they are turned too
// fast.
const PAGE_DELAY_MS = 6000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MODAL = 'micromodal portfolio_modal';
const NAME = /class="name">\s*<h3>([^<]*)</;
const SITE = /class="url">\s*<a href="(https?:[^"]+)"/;
const TAG = /<div class="tag">([^<]*)</g;
const MISSION = /mission_wrap[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
const TOOLTIP = /tooltiptext">([^<]*)</g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#038;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		if (page > 1) await wait(PAGE_DELAY_MS);
		let resp = await fetch(`${RESULTS_URL}${page}`, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(4 * PAGE_DELAY_MS);
			resp = await fetch(`${RESULTS_URL}${page}`, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) {
			throw new Error(`Failed to fetch page ${page}: ${resp.status}`);
		}
		const html = await resp.text();

		let found = 0;
		for (const modal of html.split(MODAL).slice(1)) {
			const name = clean(modal.match(NAME)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			found++;

			// the "+n" overflow counters are not missions themselves
			const missions = [...modal.matchAll(MISSION)]
				.map((m) => tag(m[1]))
				.filter((t) => t && !/^\+\d+/.test(t));
			companies.push({
				name,
				category: [
					...missions,
					...[...modal.matchAll(TOOLTIP)].map((m) => tag(m[1])),
					...[...modal.matchAll(TAG)].map((m) => tag(m[1]))
				]
					.filter(Boolean)
					.join(', '),
				url: modal.match(SITE)?.[1] ?? ''
			});
		}
		if (found === 0) break;
	}

	if (companies.length === 0) {
		throw new Error('kindred: no companies in the portfolio results');
	}

	return companies;
}
