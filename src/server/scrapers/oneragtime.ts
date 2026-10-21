import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.oneragtime.com';
const PAGE_URL = `${BASE_URL}/portfolio-companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt: the portfolio page is a grid of cards, the whole of it in the page,
// a card a company named in its logo's alt text, with a line about it and a
// badge on the ones the fund is done with ("EXIT", "WE TRIED"). the card
// opens a panel drawn from the site's content, which its script carries
// whole — a company each with its site, the year the fund invested, the
// round it came in at ("Seed"), its sector, where it is and its status
// ("Active", "Exited", "Acquired", "We tried"). the script's address
// changes with every build and is found among the page's own, by the
// content it holds; it carries the content once a language, and the
// english is the one whose names are the cards'. the panel's own chunk
// names the "website-link" field too, and loads first since october 2026,
// so a chunk is only taken for the content once its records name the cards.
//
// the cards say which companies are listed; the content adds their sites
// and tags. the sector, the place, the round and the year are kept as
// tags, an exit with the Exited tag, a sale with the Acquired tag and one
// the fund "tried" with the Closed tag.

const CARD = /(?=<div class="mt-4 w-1\/4 px-\[10px\])/;
const NAME = /<img\b[^>]*\balt="([^"]*)"/;
const BADGE = /text-white">([^<]*)<\/span>/;
const SCRIPT = /\b(?:src|href)="(\/_nuxt\/[^"]+\.js)"/g;
// the content as the script writes it: JSON.parse(`[{"id":…}]`)
const CONTENT = /JSON\.parse\(`(\[[\s\S]*?\])`\)/g;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exit(?:ed)?$/i;
const ACQUIRED = /^acquired$/i;
const TRIED = /^we tried$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	name?: string;
	'website-link'?: string | null;
	year?: string | null;
	stage?: string | null;
	sectors?: string | null;
	location?: string | null;
	statuses?: string | null;
}

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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the content's records, in the language whose names are the cards'
async function contentFor(html: string, names: Set<string>): Promise<Map<string, Entry>> {
	const scripts = [...new Set([...html.matchAll(SCRIPT)].map(([, path]) => path))];
	for (const path of scripts) {
		const code = await fetchText(`${BASE_URL}${path}`);
		// a record's field, not the code reading it: "website-link":"https…"
		if (!code.includes('"website-link":')) continue;
		let best = new Map<string, Entry>();
		let bestHits = 0;
		for (const [, literal] of code.matchAll(CONTENT)) {
			if (!literal.includes('"website-link"')) continue;
			let records: Entry[];
			try {
				// a template literal's own escapes undone, then read as JSON
				records = JSON.parse(literal.replace(/\\([\\`$])/g, '$1'));
			} catch {
				continue;
			}
			const byName = new Map(records.map((r) => [clean(r?.name ?? '').toLowerCase(), r]));
			const hits = [...names].filter((name) => byName.has(name)).length;
			if (hits > bestHits) [best, bestHits] = [byName, hits];
		}
		if (bestHits > 0) return best;
	}
	return new Map();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const cards = html
		.split(CARD)
		.slice(1)
		.map((card) => ({ name: clean(card.match(NAME)?.[1] ?? ''), badge: clean(card.match(BADGE)?.[1] ?? '') }));
	const content = await contentFor(html, new Set(cards.map(({ name }) => name.toLowerCase())));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const { name, badge } of cards) {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const record = content.get(name.toLowerCase());
		const status = clean(record?.statuses ?? '') || badge;
		const site = clean(record?.['website-link'] ?? '');
		if (/^https?:\/\//i.test(site)) withSite++;
		const year = String(record?.year ?? '').match(YEAR)?.[0];
		companies.push({
			name,
			category: [
				tag(record?.sectors ?? ''),
				tag(record?.location ?? ''),
				tag(record?.stage ?? ''),
				year ? `Invested ${year}` : '',
				EXITED.test(status)
					? 'Exited'
					: ACQUIRED.test(status)
						? 'Acquired'
						: TRIED.test(status)
							? 'Closed'
							: tag(status)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('oneragtime: no companies in the portfolio grid — the markup moved');
	}
	// without the content every company would link the page here
	if (withSite === 0) {
		throw new Error("oneragtime: no company's site was found in the page's script — the content moved");
	}

	return companies;
}
