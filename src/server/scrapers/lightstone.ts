import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.lightstonevc.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio is a grid on the home page, the whole of it in
// the page, a logo a company opening a panel with a few lines about it, a
// link to its site and its lead, its fund ("LSV", "ATV", "Morgenthaler")
// and where it is; for the page's filters each logo is classed by its
// sector ("Biopharmaceuticals", "Medical Technology") and by whether it is
// held ("Active") or one of the fund's "Select Exits & IPOs". the logos
// have no alt text; each panel keeps its company's name as the fund titles
// it, in a heading the page leaves commented out ("<!-- <h2>Cerevance</h2>"),
// and a panel without one fails the run rather than leave its company out.
// the sector, the fund and the place are kept as tags, an exit the fund no
// longer holds with the Exited tag.

const HOLDER = /(?=<div data-sector="[^"]*" data-company=)/;
const ATTRS = /^<div data-sector="([^"]*)" data-company="([^"]*)"/;
const NAME = /<!--\s*<h2>([\s\S]*?)<\/h2>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="link-site"/;
const FACT = (label: string) =>
	new RegExp(`<span class="dt">${label}:</span><span class="dd">([\\s\\S]*?)</span>`);
const SECTOR = /<select name="sector"[^>]*>([\s\S]*?)<\/select>/;
const OPTION = /<option value="([^"]+)"[^>]*>([^<]*)</g;
// "Menlo Park, CA and Singapore", "Redwood City, CA / Redmond, WA"
const PLACES = /\s*(?:,|\/|\band\b)\s*/;
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

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the sectors, by the key each logo is classed with
	const sectors = new Map(
		[...(html.match(SECTOR)?.[1] ?? '').matchAll(OPTION)].map(([, key, label]) => [key, tag(label)])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const holder of html.split(HOLDER).slice(1)) {
		const name = clean(holder.match(NAME)?.[1] ?? '');
		if (!name) {
			throw new Error("lightstone: a company's panel names no company — the panels' markup moved");
		}
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const [, sectorKeys = '', status = ''] = holder.match(ATTRS) ?? [];
		const fact = (label: string) => clean(holder.match(FACT(label))?.[1] ?? '');
		// a held company the fund has also partly sold stays held
		const exited = /\blegacy-deals\b/.test(status) && !/\bactive\b/.test(status);
		// "https://https://curie.bio/" -> "https://curie.bio/"
		const site = unescape(holder.match(SITE)?.[1] ?? '')
			.trim()
			.replace(/^https?:\/\/(?=https?:\/\/)/i, '');
		if (/^https?:\/\/[^/]+\.[^/]+/i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				...sectorKeys
					.trim()
					.split(/\s+/)
					.map((key) => sectors.get(key) ?? ''),
				...fact('Fund').split(',').map(tag),
				...fact('Location').split(PLACES).map(tag),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\/[^/]+\.[^/]+/i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('lightstone: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("lightstone: no company's panel links its site — the panels' markup moved");
	}

	return companies;
}
