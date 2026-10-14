import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://rheingau-founders.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// kirby: the portfolio is a grid of logos, the whole of it in the page, a
// logo a company carrying its name, the ids of its statuses — "Co-Founded",
// "Invested", "Exit", or "Learnings" for the ones that did not make it —
// and of its industries ("B2B", "Health Tech"), which the filters above
// the grid name. a logo opens a panel kept in the page, matched to it by
// id, giving the year the company was founded, the year the fund backed it
// and its site. the industries and the years are kept as tags, a co-founded
// company as "Co-Founded", an exit with the Exited tag and a learning with
// the Closed tag.

const CARD = /<div class="startup"[^>]*\bdata-id="([^"]*)"[^>]*\bdata-name="([^"]*)"[^>]*\bdata-status="([^"]*)"[^>]*\bdata-industry="([^"]*)"/g;
// a filter group: its type and its options, an id and a label each
const FILTERS = /<ul class="options" data-type="(\w+)">([\s\S]*?)<\/ul>/g;
const OPTION = /data-id="([^"]+)">\s*<span>([\s\S]*?)<\/span>/g;
const PANEL = /<div class="modal-container[^"]*" data-id="([^"]*)">/g;
const FACT = (label: string) => new RegExp(`<i>${label}</i>\\s*<ul>\\s*<li>\\s*((?:19|20)\\d{2})`);
const SITE = /<a class="text-link" href="([^"]*)"[^>]*>\s*Visit Site/;
const CO_FOUNDED = /^co-founded$/i;
const EXIT = /^exit$/i;
const LEARNINGS = /^learnings$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|invested)$/i;
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

	// the filters' labels, by type and id
	const labels = new Map<string, Map<string, string>>();
	for (const [, type, options] of html.matchAll(FILTERS)) {
		labels.set(type, new Map([...options.matchAll(OPTION)].map(([, id, label]) => [id, clean(label)])));
	}
	const named = (type: string, ids: string) =>
		ids
			.split(',')
			.map((id) => labels.get(type)?.get(id.trim()) ?? '')
			.filter(Boolean);

	// each panel, by the id of its logo
	const panels = new Map<string, string>();
	const starts = [...html.matchAll(PANEL)];
	starts.forEach((panel, i) => panels.set(panel[1], html.slice(panel.index, starts[i + 1]?.index)));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, id, written, status, industry] of html.matchAll(CARD)) {
		const name = clean(written);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const statuses = named('status', status);
		const panel = panels.get(id) ?? '';
		const founded = panel.match(FACT('Founded'))?.[1];
		const backed = panel.match(FACT('Backed since'))?.[1];
		const site = unescape(panel.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...named('industry', industry).map(tag),
				founded ? `Founded ${founded}` : '',
				backed ? `Invested ${backed}` : '',
				statuses.some((s) => CO_FOUNDED.test(s)) ? 'Co-Founded' : '',
				statuses.some((s) => EXIT.test(s)) ? 'Exited' : '',
				statuses.some((s) => LEARNINGS.test(s)) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('rheingau: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
