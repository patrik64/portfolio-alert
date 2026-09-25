import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.definevc.com';
const PAGE_URL = `${BASE_URL}/partners`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the partners page tiles every company — the name and a line
// about it — linking a page on the fund's site, two tiles left invisible
// as placeholders for incubations. the company's page names its site under
// "Website" and, under "Initial Partnership", the round the fund came in
// at and the year ("Series B, 2026"); those pages are fetched for that.
// one that will not load leaves its company linking to that page. a
// company that has gone public carries its ticker in its name — "Hims &
// Hers (NYSE: HIMS)" — which is cut off and kept as the outcome.

const ITEM = /(?=<div[^>]*class="partners_grid-item w-dyn-item")/;
const LINK = /<a\b[^>]*\bhref="(\/partners\/[^"#?]+)"[^>]*class="([^"]*)"/;
const NAME = /class="team_slide-data"[^>]*>\s*<div class="text-size-medium"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOISE = /definevc\.com|website-files\.com|linkedin\.com|x\.com|twitter\.com|jsdelivr|googleapis/i;
// "Series B, 2026", a testimonial sometimes following straight on
const PARTNERSHIP = /Initial Partnership\s+([A-Za-z][^,"“”]{0,30}?),?\s+((?:19|20)\d{2})\b/;
const TICKER = /^(.*?)\s*\(((?:NYSE|NASDAQ|LSE|TSX|ASX)\s*:\s*[A-Z.]+)\)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;|‍/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what a company's page adds — its site, and the round and year — or
// nothing when the page will not load
async function detailOf(page: string): Promise<{ site: string; partnership: string[] }> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return { site: '', partnership: [] };
		const html = await resp.text();
		const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
		const site = [...main.matchAll(SITE)].map((m) => unescape(m[1])).find((u) => !NOISE.test(u)) ?? '';
		// the round, and the year as "Invested 2026"
		const [, round, year] = clean(main).match(PARTNERSHIP) ?? [];
		return { site, partnership: [tag(round ?? ''), year ? `Invested ${year}` : ''] };
	} catch {
		return { site: '', partnership: [] };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const tiles: { name: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const link = item.match(LINK);
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!link || /w-condition-invisible/.test(link[2]) || !name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		tiles.push({ name, page: `${BASE_URL}${unescape(link[1])}` });
	}
	if (tiles.length === 0) {
		throw new Error('define: no companies on the partners page');
	}

	const companies: ScrapedCompany[] = [];
	for (const [i, tile] of tiles.entries()) {
		if (i > 0) await wait(PACE_MS);
		const { site, partnership } = await detailOf(tile.page);
		const [, name, ticker] = tile.name.match(TICKER) ?? [undefined, tile.name, ''];
		companies.push({
			name: name || tile.name,
			category: [...partnership, ticker ? tag(ticker) : '', ticker ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || tile.page
		});
	}

	return companies;
}
