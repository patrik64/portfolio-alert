import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.shiftinvest.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page (astro): the companies page is a grid of tiles, the whole of
// it in the page, a tile a company with a line saying what it does ("Yard
// automation"), the theme the page filters by ("Mobility"), the year the
// fund came in and an "Exit" badge for one it is out of. each tile opens a
// dialog further down, matched by its id, which names the company in a
// heading and links its site. what the company does, its theme and the year
// are kept as tags, an exit with the Exited tag.

const TILE = /<button type="button" class="company"[^>]*\bdata-open="([^"]*)"[^>]*\baria-label="About ([^"]*)"[^>]*>([\s\S]*?)<\/button>/g;
const DIALOG = /<dialog class="company-card" id="([^"]*)"[^>]*>([\s\S]*?)<\/dialog>/g;
const HEADING = /<h2 class="card-name"[^>]*>([\s\S]*?)<\/h2>/;
const SITE = /<a\b[^>]*\bclass="[^"]*\bcard-link\b[^"]*"[^>]*\bhref="([^"]*)"/;
const LINE = /<div class="desc"[^>]*>([\s\S]*?)<\/div>/;
const THEME = /<span class="theme"[^>]*>([\s\S]*?)<\/span>/;
const YEAR = /<span class="year"[^>]*>\s*(\d{4})\s*<\/span>/;
const EXIT = /<span class="exit"[^>]*>\s*Exit\s*<\/span>/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

// companies the page has since renamed, kept under the names stored for them
const STORED_AS: Record<string, string> = {
	protix: 'Protix Biosystems',
	'robin radar': 'Robin',
	snocom: 'Snowcom'
};

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
	let resp: Response;
	try {
		resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	} catch (err) {
		// the cause behind node's bare "fetch failed": a connection that times
		// out or is refused, a name that no longer resolves
		const cause = (err as { cause?: { code?: string; message?: string } }).cause;
		const why = [cause?.code, cause?.message ?? (err instanceof Error ? err.message : String(err))]
			.filter(Boolean)
			.join(': ')
			.slice(0, 160);
		throw new Error(`shiftinvest: ${PAGE_URL} did not answer — ${why}`);
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the dialogs, by the id each tile opens
	const dialogs = new Map([...html.matchAll(DIALOG)].map(([, id, body]) => [id, body]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, id, label, tile] of html.matchAll(TILE)) {
		const dialog = dialogs.get(id) ?? '';
		const shown = clean(dialog.match(HEADING)?.[1] ?? '') || clean(label);
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(dialog.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(tile.match(LINE)?.[1] ?? ''),
				tag(tile.match(THEME)?.[1] ?? ''),
				tile.match(YEAR)?.[1] ?? '',
				EXIT.test(tile) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('shiftinvest: no companies on the companies page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("shiftinvest: no company links its site — the dialogs' markup moved");
	}

	return companies;
}
