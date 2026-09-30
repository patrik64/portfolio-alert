import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.avesta.fund/portfolio';
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a gallery of logos, each titled with the
// company and linking its site, served as data in the page, and above it
// a row of buttons, "All" and then the categories ("Energy Systems",
// "Mobility"), each a page of its own with a gallery of its own. the
// portfolio page's gallery shows only its first batch, though it counts
// more, and the category pages show the rest, so the portfolio page and
// every category page are read, one at a time, and a company takes its
// categories as tags, "Other" left out. a category page whose gallery
// comes in part fails the run.

const WARMUP = /<script\b[^>]*\bid="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/;
const BUTTON = /<a\b[^>]*\bwixui-button\b[^>]*>/g;
const HREF = /\bhref="([^"]*)"/;
const ARIA_LABEL = /\baria-label="([^"]*)"/;
const GALLERY = 'class="pro-gallery';
const DROPPED = /^(?:all|others?)$/i;
const STEALTH = /^stealth\b/i;

interface Item {
	metaData?: {
		title?: string;
		link?: { url?: string; data?: { url?: string } };
	};
}

interface Gallery {
	items?: Item[];
	totalItemsCount?: number;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => unescape(s).replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

const bare = (url: string) => url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, with a refusal waited out once
async function fetchText(url: string): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		return resp.text();
	}
}

// the galleries whose data the page carries
function galleriesIn(html: string): Gallery[] {
	const json = html.match(WARMUP)?.[1];
	if (!json) return [];
	const apps = (JSON.parse(json) as { appsWarmupData?: Record<string, Record<string, unknown>> }).appsWarmupData ?? {};
	return Object.values(apps).flatMap((app) =>
		Object.entries(app)
			.filter(([key]) => key.endsWith('_galleryData'))
			.map(([, gallery]) => gallery as Gallery)
	);
}

// the buttons after the one for this page and before its gallery
function categoriesIn(html: string): { url: string; label: string }[] {
	const buttons = [...html.matchAll(BUTTON)].map((m) => ({
		at: m.index ?? 0,
		url: unescape(m[0].match(HREF)?.[1] ?? '').trim(),
		label: tag(m[0].match(ARIA_LABEL)?.[1] ?? '')
	}));
	const all = buttons.findIndex(({ url }) => bare(url) === bare(PAGE_URL));
	if (all < 0) return [];
	const end = html.indexOf(GALLERY, buttons[all].at);
	return buttons
		.slice(all + 1)
		.filter(({ at, url, label }) => (end < 0 || at < end) && /^https?:\/\//i.test(url) && label);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const found = new Map<string, { name: string; url: string; tags: string[] }>();
	const add = (items: Item[], category: string) => {
		for (const { metaData } of items) {
			const name = (metaData?.title ?? '').replace(/\s+/g, ' ').trim();
			if (!name) continue;
			const key = name.toLowerCase();
			const site = (metaData?.link?.url ?? metaData?.link?.data?.url ?? '').trim();
			const company = found.get(key) ?? { name, url: /^https?:\/\//i.test(site) ? site : PAGE_URL, tags: [] };
			if (category && !DROPPED.test(category) && !company.tags.includes(category)) company.tags.push(category);
			found.set(key, company);
		}
	};
	for (const { items } of galleriesIn(html)) add(items ?? [], '');
	for (const { url, label } of categoriesIn(html)) {
		await wait(PACE_MS);
		for (const { items = [], totalItemsCount } of galleriesIn(await fetchText(url))) {
			if ((totalItemsCount ?? 0) > items.length) {
				throw new Error(`avesta: the ${label} page's gallery came with ${items.length} of its ${totalItemsCount} companies`);
			}
			add(items, label);
		}
	}
	if (found.size === 0) {
		throw new Error('avesta: no companies in the gallery');
	}

	return [...found.values()]
		.filter(({ name }) => !STEALTH.test(name))
		.map(({ name, url, tags }) => ({ name, category: tags.join(', '), url }));
}
