import type { ScrapedCompany } from './types';

const BASE_URL = 'https://marathon.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro: the portfolio page is a grid of cells, the whole of it in the page,
// a cell a company with its name, a line about it and either the year the
// fund first invested or how it left ("Exited · CNH Industrial",
// "Inactive"), linking its page here — all but a company no longer running,
// which links nowhere. the page counts its companies ("23 companies since
// 2017"), and a grid holding fewer fails the run rather than pass for the
// whole. a company's page gives its site and the month the fund first
// invested. the year is kept as a tag, a sale with its buyer and the
// Exited tag, a company no longer running with the Closed tag. a company
// page that will not load, or is not reached by the deadline, leaves its
// company linking it.

const CELL = /<(a|div)\b([^>]*)\bclass="company-cell\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
const HREF = /\bhref="([^"]*)"/;
const STATUS = /\bdata-status="([^"]*)"/;
const NAME = /class="company-cell__name">([\s\S]*?)<\/span>/;
const META = /class="company-cell__meta">([\s\S]*?)<\/span>/;
const COUNT = />\s*(\d+) companies since\b/;
const SITE = /<a class="btn-secondary" href="([^"]*)"[^>]*>\s*Visit website/;
const INVESTED = /<dt>First investment<\/dt>\s*<dd>([\s\S]*?)<\/dd>/;
// "Exited · CNH Industrial"
const BUYER = /^exited\s*·\s*(.+)$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exited$/i;
const INACTIVE = /^inactive$/i;
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

// a company page's site and the year the fund first invested, or nothing when it will not load
async function detailsOf(href: string): Promise<{ site: string; year?: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			year: clean(html.match(INVESTED)?.[1] ?? '').match(YEAR)?.[0]
		};
	} catch {
		return { site: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cells = [...html.matchAll(CELL)];
	const counted = Number(html.match(COUNT)?.[1] ?? 0);
	if (cells.length < counted) {
		throw new Error(`marathon: the grid holds ${cells.length} cells of the ${counted} companies it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, , attrs, cell] of cells) {
		const name = clean(cell.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = clean(attrs.match(STATUS)?.[1] ?? '');
		const meta = clean(cell.match(META)?.[1] ?? '');
		const path = unescape(attrs.match(HREF)?.[1] ?? '').trim();
		const href = path ? new URL(path, BASE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const details = reached ? await detailsOf(href) : { site: '' };
		if (details.site) withSite++;
		const buyer = meta.match(BUYER)?.[1] ?? '';
		const year = meta.match(YEAR)?.[0] ?? details.year;
		const exited = EXITED.test(status) || !!buyer;
		companies.push({
			name,
			category: [
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : '',
				INACTIVE.test(status) || INACTIVE.test(meta) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: details.site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('marathon: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("marathon: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
