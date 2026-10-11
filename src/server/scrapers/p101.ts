import type { ScrapedCompany } from './types';

const BASE_URL = 'https://p101.it';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 20;
// the company pages are slow, more than a second each, so none is begun
// past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a wall of logos, a company each, linking
// its page here and showing, for one the fund is out of, its status —
// "Exit" with the buyer ("Strava", "Campari & LVMH") or "Write-off" with
// "We tried". the logos' alt text is the image's file name, so the cells,
// which decide who is listed, are matched by their link to the site's own
// api, which gives each company's name, its industries ("Fintech",
// "Indirect Investments"), its country and the funds it was backed from
// ("Programma 101", "Italia 500"). a company's page adds its site and the
// year of the fund's initial investment. the industries, the country, the
// funds and the year are kept as tags, a buyer as "Acquired by …" with the
// Exited tag, a write-off with the Closed tag. a cell the api does not know
// fails the run; a company page that will not load, or is not reached by
// the deadline, leaves its company linking it.

const CELL = /<a\s+class="[^"]*\bcompany-list-1__cell\b[^"]*"\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const LABEL = /class="company-list-1__status-label"[^>]*>([\s\S]*?)<\/span>/;
const DETAILS = /class="company-list-1__status-details"[^>]*>([\s\S]*?)<\/p>/;
// the company page's "Website" button
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<span class="button__label">\s*Website\s*<\/span>/i;
// the first year on the page's timeline, the "Initial Investment"
const INITIAL = /<time class="timeline-1__item-date"[^>]*>\s*((?:19|20)\d{2})/;
const EXIT = /^exit(?:ed)?$/i;
const WRITE_OFF = /^write-?off$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	link?: string;
	title?: { rendered?: string };
	cwp_industry?: number[];
	cwp_location?: number[];
	cwp_fund?: number[];
}

interface Term {
	id?: number;
	name?: string;
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

// "https://p101.it/azienda/bemyeye" -> "p101.it/azienda/bemyeye/", to match links
const linkKey = (href: string) =>
	unescape(href)
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\/(?:www\.)?/, '')
		.replace(/[?#].*$/, '')
		.replace(/\/?$/, '/');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string, accept = 'text/html'): Promise<Response> {
	const headers = { 'User-Agent': UA, Accept: accept };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// every item of an api collection, a hundred at a time
async function all<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const resp = await get(`${API_URL}/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, 'application/json');
		if (!resp.ok) {
			throw new Error(`p101: the site's api answered ${resp.status} for ${path.split('?')[0]}`);
		}
		pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		items.push(...((await resp.json()) as T[]));
	}
	return items;
}

interface Page {
	site: string;
	year?: string;
}

// what a company's page says, or nothing when it will not load
async function pageOf(href: string): Promise<Page | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { site: /^https?:\/\//i.test(site) ? site : '', year: html.match(INITIAL)?.[1] };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cells = [...html.matchAll(CELL)].map(([, href, body]) => ({
		href: unescape(href).trim(),
		label: clean(body.match(LABEL)?.[1] ?? ''),
		details: clean(body.match(DETAILS)?.[1] ?? '')
	}));
	if (cells.length === 0) {
		throw new Error('p101: no companies on the portfolio page — the markup moved');
	}

	const [posts, industries, locations, funds] = await Promise.all([
		all<Post>('cwp_company?_fields=link,title,cwp_industry,cwp_location,cwp_fund'),
		all<Term>('cwp_industry?_fields=id,name'),
		all<Term>('cwp_location?_fields=id,name'),
		all<Term>('cwp_fund?_fields=id,name')
	]);
	const byLink = new Map(posts.map((p) => [linkKey(p.link ?? ''), p]));
	const names = (terms: Term[]) => new Map(terms.map((t) => [t.id, clean(t.name ?? '')]));
	const [industry, location, fund] = [names(industries), names(locations), names(funds)];

	// a part of the list must not pass for the whole
	const missing = cells.filter((cell) => !byLink.has(linkKey(cell.href)));
	if (missing.length > 0) {
		throw new Error(`p101: ${missing.length} of the portfolio's companies are not in the site's api`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const cell of cells) {
		const post = byLink.get(linkKey(cell.href))!;
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const reached = /^https?:\/\//i.test(cell.href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const page = reached ? await pageOf(cell.href) : null;
		if (page?.site) withSite++;
		const exit = EXIT.test(cell.label);
		const terms = (ids: number[] | undefined, by: Map<number | undefined, string>) =>
			(ids ?? []).map((id) => tag(by.get(id) ?? ''));
		companies.push({
			name,
			category: [
				...terms(post.cwp_industry, industry),
				...terms(post.cwp_location, location),
				...terms(post.cwp_fund, fund),
				page?.year ? `Invested ${page.year}` : '',
				exit && cell.details ? `Acquired by ${tag(cell.details)}` : '',
				exit ? 'Exited' : '',
				WRITE_OFF.test(cell.label) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || cell.href || PAGE_URL
		});
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("p101: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
