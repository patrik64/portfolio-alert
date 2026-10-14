import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.demea-si.com';
// the portfolio as the fund writes it, in french
const PAGE_URL = `${BASE_URL}/fr/portfolio`;
// the same grid in english, for its labels
const LABELS_URL = `${BASE_URL}/en/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// demea invest (once demeter): the portfolio page is a grid of cards, the
// whole of it in the page, a card a company linking its page here, with
// its name, the business line it sits in ("Venture capital", "Private
// equity", "Infrastructure") and, for a company still held, its activity
// ("Agricultural robotics"); the exits come in the grid too, hidden until
// the page's "Exit" filter shows them.
//
// the site is french, and its english pages are machine-translated, names
// and all — "Les Grappes" is "Clusters" there, "Bout à Bout" "Butt to
// Butt" — so the companies are read from the french grid, and the english
// grid gives only its labels, each card known in both by its picture. the
// grid writes names in capitals ("LES GRAPPES"); a company's page writes
// it as the fund keeps it ("Les Grappes — Portfolio — …"), taken where it
// spells the same name, and gives its site — the english page's where the
// french one has none. the activity and the business line are kept as
// tags, an exit with the Exited tag. a company page that will not load, or
// is not reached by the deadline, leaves its company named in capitals and
// linking it.

const CARD =
	/<a href="([^"]*)" class="portfolio-card(?: hidden)?" data-strategy="([^"]*)" data-exit="(\d)">([\s\S]*?)<\/a>/g;
const PICTURE = /\/uploads\/portfolio\/([^'"]+)['"]/;
const NAME = /class="portfolio-title">([\s\S]*?)<\/h3>/;
const ACTIVITY = /class="portfolio-category">([\s\S]*?)<\/span>/;
const TITLE = /<title>\s*([^<]*?)\s*—\s*Portfolio\s*—/;
const SITE = /<div class="portfolio-info-label">(?:Site web|Website)<\/div>[\s\S]*?<a href="([^"]*)"/;
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

async function pageText(url: string): Promise<string> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a company page's name and site, or nothing when it will not load
async function detailsOf(href: string): Promise<{ name: string; site: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { name: '', site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { name: clean(html.match(TITLE)?.[1] ?? ''), site: /^https?:\/\//i.test(site) ? site : '' };
	} catch {
		return { name: '', site: '' };
	}
}

interface Labels {
	href: string;
	strategy: string;
	activity: string;
}

const link = (href: string) => (/^https?:\/\//i.test(href) ? unescape(href).trim() : '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const html = await pageText(PAGE_URL);
	// the english grid's card for each picture: its labels and its page
	const english = new Map(
		[...(await pageText(LABELS_URL)).matchAll(CARD)].map(([, href, strategy, , card]): [string, Labels] => [
			card.match(PICTURE)?.[1] ?? '',
			{ href: link(href), strategy, activity: card.match(ACTIVITY)?.[1] ?? '' }
		])
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [, href, , exit, card] of html.matchAll(CARD)) {
		const written = clean(card.match(NAME)?.[1] ?? '');
		if (!written || STEALTH.test(written) || seen.has(written.toLowerCase())) continue;
		seen.add(written.toLowerCase());
		const labels = english.get(card.match(PICTURE)?.[1] ?? '');
		const page = link(href);
		let details = { name: '', site: '' };
		for (const url of [page, labels?.href ?? '']) {
			if (!url || details.site || Date.now() - started >= DEADLINE_MS) continue;
			if (companies.length > 0 || url !== page) await wait(PACE_MS);
			const found = await detailsOf(url);
			details = { name: details.name || (url === page ? found.name : ''), site: found.site };
		}
		if (details.site) withSite++;
		// the page's own spelling of the grid's name, never another name
		const name = details.name.toLowerCase() === written.toLowerCase() ? details.name : written;
		companies.push({
			name,
			category: [tag(labels?.activity ?? ''), tag(labels?.strategy ?? ''), exit === '1' ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: details.site || page || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('demea: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("demea: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
