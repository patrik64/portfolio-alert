import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.redriverwest.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a grid of tiles, the whole of it in the
// page, a tile a company named in its picture's alt text ("Ada", or "Logo
// Macrodata Labs" where it has only its logo) and marked "exited" when the
// fund is out of it. the page's tabs split the grid between the fund
// ("Red", shown first) and its >commit fund, whose tiles come hidden and
// link the company's site. a fund company's tile links its page here,
// which gives the month the fund invested, its site, the round it came in
// at ("Series B") and its sector. a tile still in stealth is left out. the
// sector, the round, the year and the >commit fund are kept as tags, an
// exit with the Exited tag. a company page that will not load, or is not
// reached by the deadline, leaves its company linking it.

const TILE =
	/<div\b([^>]*)>(<(?:a|div)\b[^>]*\bclass="group relative block aspect-square overflow-hidden"[^>]*>)([\s\S]*?)(?=<div\b[^>]*>(?:<a|<div)\b[^>]*\bclass="group relative block aspect-square overflow-hidden"|<\/section>)/g;
const HREF = /\bhref="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const EXITED = />exited<\/span>/;
const FACT = (label: string) =>
	new RegExp(`<p class="rrw-body font-black">${label}</p>\\s*<(?:p|a)\\b([^>]*)>([\\s\\S]*?)</(?:p|a)>`);
const YEAR = /\b(?:19|20)\d{2}\b/;
const COMMIT = '>commit';
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[\s​]+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

interface Details {
	site: string;
	year?: string;
	round: string;
	sector: string;
}

// a company page's site and facts, or nothing when it will not load
async function detailsOf(href: string): Promise<Details> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '', round: '', sector: '' };
		}
		const html = await resp.text();
		const fact = (label: string) => clean(html.match(FACT(label))?.[2] ?? '');
		const site = unescape(html.match(FACT('Website'))?.[1].match(HREF)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			year: fact('Investment Date').match(YEAR)?.[0],
			round: fact('Initial Investment'),
			sector: fact('Sector')
		};
	} catch {
		return { site: '', round: '', sector: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, wrapper, anchor = '', tile] of html.matchAll(TILE)) {
		// a tile without a picture writes its name in brackets: "(stealth)"
		const written =
			tile.match(ALT)?.[1] ??
			tile.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?>\s*\(|\)\s*<[\s\S]*$/g, '');
		const name = clean(written).replace(/^Logo\s+/, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// a tile the page opens hidden is >commit's, the page opening on the fund's own
		const commit = /\bhidden\b/.test(wrapper);
		const link = unescape(anchor.match(HREF)?.[1] ?? '').trim();
		const own = link.startsWith('/');
		const href = own ? new URL(link, BASE_URL).href : link;
		const reached = own && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const details: Details = reached ? await detailsOf(href) : { site: '', round: '', sector: '' };
		if (details.site) withSite++;
		companies.push({
			name,
			category: [
				tag(details.sector),
				tag(details.round),
				details.year ? `Invested ${details.year}` : '',
				commit ? COMMIT : '',
				EXITED.test(tile) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: details.site || (/^https?:\/\//i.test(href) ? href : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('redriverwest: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every fund company would link its page here
	if (withSite === 0) {
		throw new Error("redriverwest: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
