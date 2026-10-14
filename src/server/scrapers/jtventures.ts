import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.jtventures.cz';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, in czech (the english page lists nothing): the portfolio page is
// three lists of logos, the whole of each in the page — the startups held,
// the "Exited" ones and the "R.I.P." ones — a logo a company named under it
// and linking its page here. a company's page gives its business model
// ("B2B", "Marketplace"), its segments ("FinTech", "DeepTech") and its
// site. the models and the segments are kept as tags, an exit with the
// Exited tag and a company closed with the Closed tag. a company page that
// will not load, or is not reached by the deadline, leaves its company
// linking it.

const SECTION = /class="portfolio-body_(all|exited|rip)"/g;
const ITEM = /<a href="([^"]*)" class="startup-item_component\b[^"]*">[\s\S]*?<h2 class="text-size-small">([\s\S]*?)<\/h2>/g;
const TAG = /<a href="\/portfolio\?(?:models|segments)=[^"]*"[^>]*class="tag_component">([^<]*)<\/a>/g;
const SITE = /<a href="([^"]*)"[^>]*class="startup-header_website-link\b/;
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

// a company page's tags and site, or nothing when it will not load
async function detailsOf(href: string): Promise<{ tags: string[]; site: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { tags: [], site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			tags: [...html.matchAll(TAG)].map(([, label]) => tag(label)),
			site: /^https?:\/\//i.test(site) ? site : ''
		};
	} catch {
		return { tags: [], site: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// where each list begins, to tell a logo's list by where it stands
	const sections = [...html.matchAll(SECTION)].map((m) => ({ kind: m[1], at: m.index ?? 0 }));
	if (!sections.some((s) => s.kind === 'all')) {
		throw new Error("jtventures: the portfolio page's lists moved");
	}
	const kindAt = (at: number) => sections.filter((s) => s.at < at).pop()?.kind ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const match of html.matchAll(ITEM)) {
		const kind = kindAt(match.index ?? 0);
		if (!kind) continue;
		const name = clean(match[2]);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(match[1]), BASE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { tags, site } = reached ? await detailsOf(href) : { tags: [], site: '' };
		if (site) withSite++;
		companies.push({
			name,
			category: [...tags, kind === 'exited' ? 'Exited' : kind === 'rip' ? 'Closed' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('jtventures: no companies on the portfolio page — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("jtventures: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
