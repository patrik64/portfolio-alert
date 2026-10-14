import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.practica.vc/en/investments';
const MAX_PAGES = 40;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// laravel: the investments page is a grid of cards, twelve a page
// (?page=2), a card a company linking its page here, with its name, its
// categories ("BioTech | Life Sciences"), the stage the fund came in at
// ("Seed", "Early", "Growth") and an "Exited" tag for one the fund is out
// of. a company's page adds the year the fund invested and, in its text,
// its site ("Website: adduplex.com"); older pages name no site and leave
// their company linking its page. the categories, the stage and the
// year are kept as tags, an exit with the Exited tag. every page of the
// grid must load; a company page that will not, or is not reached by the
// deadline, leaves its company linking it.

const CARD = /<div class="card has-shadow">([\s\S]*?)class="card__more"/g;
const PAGE = /<a href="([^"]*)" class="card__img\b/;
const NAME = /<h4>([\s\S]*?)<\/h4>/;
const CATEGORY = /<div class="category">([\s\S]*?)<\/div>/;
const TAG = /<span class="tag( is-red)?">([^<]*)<\/span>/g;
const NEXT = /<a href="([^"]*)" rel="next">/;
const INVESTED = /Year of investment:<\/span>([^<]*)</i;
// "<strong>Website:</strong>&nbsp;<a href…>", "Website: <a href…>", "Website:&nbsp;https://aurorapt.fi"
const SITE =
	/\bWebsite:?\s*(?:<\/(?:strong|b)>)?(?:\s|&nbsp;|:)*(?:<a\b[^>]*\bhref="([^"]*)"|(https?:\/\/[^\s<"&]+))/i;
const EXITED = /^exited$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
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

// a company page's site and the year the fund invested, or nothing when it will not load
async function detailsOf(href: string): Promise<{ site: string; year?: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '' };
		}
		const html = await resp.text();
		const found = html.match(SITE);
		const site = unescape(found?.[1] ?? found?.[2] ?? '').trim();
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

	// the whole grid, a page at a time; a part of it must not pass for the whole
	const cards: string[] = [];
	for (let url: string | undefined = PAGE_URL, page = 0; url !== undefined && page < MAX_PAGES; page++) {
		const resp: Response = await get(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		cards.push(...[...html.matchAll(CARD)].map(([, card]) => card));
		const next: string | undefined = html.match(NEXT)?.[1];
		url = next ? new URL(unescape(next), PAGE_URL).href : undefined;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = card.match(PAGE)?.[1];
		const href = path ? new URL(unescape(path), PAGE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { site, year } = reached ? await detailsOf(href) : { site: '', year: undefined };
		if (site) withSite++;
		const tags = [...card.matchAll(TAG)].map(([, , label]) => clean(label));
		companies.push({
			name,
			category: [
				...clean(card.match(CATEGORY)?.[1] ?? '')
					.split('|')
					.map(tag),
				...tags.filter((t) => !EXITED.test(t)).map(tag),
				year ? `Invested ${year}` : '',
				tags.some((t) => EXITED.test(t)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('practica: no companies in the investments grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("practica: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
