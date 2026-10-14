import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://concentric.vc/investments/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the investments page is a grid of logos, a card each with a
// year, the company's name and a line about it, a link to its site and,
// for one the fund is out of, an "Alumni" badge. the grid is written once
// whole ("ALL") and again per fund — Concentric 01 and 02, the Timechain
// bitcoin fund, the Concentric Sensei vehicle, co-investments, and the
// funds Concentric has backed as an investor itself. the whole grid decides
// who is listed, less what appears only among those funds of funds, which
// are not companies; the vehicles a company appears under are kept as
// tags, an alumnus with the Exited tag. the year is left unread, as the
// page does not say what it is.

// the grids, by the id the page gives each, and what the page calls them
const ALL = 'all';
const FUND_OF_FUNDS = 'fund';
const VEHICLES: Record<string, string> = {
	concentric1: 'Concentric 01',
	concentric2: 'Concentric 02',
	portfolio: 'Timechain',
	spv_investments_Id: 'Concentric Sensei',
	coinvestments: 'Co-investments'
};

const GRID = /<div class="logos(?: selected)?" id="([^"]+)">/g;
const CARD = /(?=<div class="logo-item" g-ref="logo">)/;
const NAME = /class="logo-item__domain">([\s\S]*?)<\/span>/;
const SITE = /<a href="([^"]*)"[^>]*class="logo-item__link"/;
const ALUMNI = /class="exited_block"/;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each grid's cards, by the grid's id
	const grids = new Map<string, string[]>();
	const starts = [...html.matchAll(GRID)];
	starts.forEach((grid, i) => {
		const body = html.slice(grid.index, starts[i + 1]?.index);
		grids.set(grid[1], body.split(CARD).slice(1));
	});
	const whole = grids.get(ALL);
	if (!whole?.length) {
		throw new Error('concentric: the page has no "all" grid — the markup moved');
	}

	// the vehicles each name appears under
	const under = new Map<string, Set<string>>();
	for (const [id, cards] of grids) {
		if (id === ALL) continue;
		for (const card of cards) {
			const key = clean(card.match(NAME)?.[1] ?? '').toLowerCase();
			if (!key) continue;
			if (!under.has(key)) under.set(key, new Set());
			under.get(key)!.add(id);
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of whole) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		const ids = [...(under.get(name.toLowerCase()) ?? [])];
		// a fund the firm has backed, not a company
		if (ids.length > 0 && ids.every((id) => id === FUND_OF_FUNDS)) continue;
		seen.add(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...ids.map((id) => VEHICLES[id] ?? ''), ALUMNI.test(card) ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('concentric: the "all" grid names no companies');
	}

	return companies;
}
