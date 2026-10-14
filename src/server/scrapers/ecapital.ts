import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ecapital.vc/portfolio/';
// the grid as the page's status filter narrows it to the companies exited
const EXITED_URL = `${PAGE_URL}?fwp_portfolio_status=exited`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with facetwp: the portfolio is a grid of tiles, the whole of it
// in the page, a tile a company linking its page here, with its name and
// its sector ("Cybersecurity", "Industry 4.0"). the page's status filter
// ("Exited", "Active") narrows the grid in the page too, so the grid as
// filtered to "Exited" says which companies the fund is out of. a company's
// page adds its site and its headquarters ("Amsterdam, Netherlands"). the
// sector and the place are kept as tags, an exit with the Exited tag; a
// company listed twice, once held and once exited ("Jedox", a stake sold
// and one kept), is the one held. a company page that will not load, or is
// not reached by the deadline, leaves its company linking it.

const TILE = /<a href="([^"]*)" class="c-tease__content c-tease__content--portfolio">[\s\S]*?<\/a>/g;
const NAME = /class="c-tease__title c-tease__title--portfolio">([\s\S]*?)<\/h3>/;
const SECTOR = /class="c-tease__subtitle c-tease__subtitle--portfolio">([\s\S]*?)<\/h4>/;
const FACT = (label: string) =>
	new RegExp(`<dt class="c-list__title[^"]*">${label}</dt>\\s*<dd class="c-list__item[^"]*">([\\s\\S]*?)</dd>`);
const HREF = /<a href="([^"]*)"/;
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

// the grid's tiles, by the company page each links
async function tiles(url: string): Promise<Map<string, string>> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	const html = await resp.text();
	return new Map([...html.matchAll(TILE)].map(([tile, href]) => [unescape(href).trim(), tile]));
}

// a company page's site and headquarters, or nothing when it will not load
async function detailsOf(href: string): Promise<{ site: string; place: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '', place: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(FACT('Website'))?.[1].match(HREF)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			place: clean(html.match(FACT('Headquarter'))?.[1] ?? '')
		};
	} catch {
		return { site: '', place: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const grid = await tiles(PAGE_URL);
	const exited = await tiles(EXITED_URL);
	// a filter the page stopped honouring would mark the whole grid exited
	if (grid.size > 0 && exited.size >= grid.size) {
		throw new Error("ecapital: the status filter no longer narrows the grid — the page's filter moved");
	}

	const nameOf = (tile: string) => clean(tile.match(NAME)?.[1] ?? '');
	const held = new Set(
		[...grid].filter(([href]) => !exited.has(href)).map(([, tile]) => nameOf(tile).toLowerCase())
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [href, tile] of grid) {
		const name = nameOf(tile);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		if (exited.has(href) && held.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { site, place } = reached ? await detailsOf(href) : { site: '', place: '' };
		if (site) withSite++;
		companies.push({
			name,
			category: [tag(tile.match(SECTOR)?.[1] ?? ''), ...place.split(',').map(tag), exited.has(href) ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ecapital: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("ecapital: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
