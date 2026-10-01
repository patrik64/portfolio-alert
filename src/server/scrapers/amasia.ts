import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.amasia.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a gallery of logos, each with the
// tags the filter reads, hidden in its caption ("Sustainability, SaaS,
// Europe, Thesis 2.0: Climate & Sustainability"), kept as tags, and opening
// the company's page on the fund's site in a lightbox ("#lightbox>lob"),
// where the company is the page's title and its site the "Website" link,
// and where a company the fund is out of has its line open on "(Exited)".
// those pages are fetched one at a time, and one that will not load fails
// the run, since the company's name is only there. one logo opens the page
// of the company before it, so a logo whose page an earlier logo already
// opened is read from the page its image's file is named for instead
// ("Renaissance.png" -> "/renaissance"), or named after the file.

const ITEM = /<figure class="gallery-grid-item\b[\s\S]*?<\/figure>/g;
const LIGHTBOX = /\bhref="#lightbox(?:&gt;|>)([^"]+)"/;
const IMAGE = /\bdata-src="([^"]*)"/;
const TAGS = /<span class="tags"[^>]*>([\s\S]*?)<\/span>/;
const TITLE = /<title>([\s\S]*?)<\/title>/;
const MAIN = /<main\b[\s\S]*?<\/main>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]*)"/g;
const EXITED = /\(exited\)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&mdash;/g, '—')
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "…/1767670652172-YBQA…/Renaissance.png" -> "Renaissance"
const fileOf = (src: string) => {
	const last = unescape(src).split(/[?#]/)[0].split('/').pop() ?? '';
	try {
		return decodeURIComponent(last.replace(/\+/g, ' ')).replace(/\.\w+$/, '').trim();
	} catch {
		return last.replace(/\.\w+$/, '').trim();
	}
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Detail {
	name: string;
	site: string;
	exited: boolean;
}

// the company's page on the fund's site, or null when there is none; a
// refusal is waited out once, and a page that will not load otherwise
// fails the run
async function detailOf(slug: string): Promise<Detail | null> {
	const page = `${BASE_URL}/${slug}`;
	for (let attempt = 0; ; attempt++) {
		const resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429 && attempt === 0) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			continue;
		}
		if (resp.status === 404) {
			await resp.body?.cancel();
			return null;
		}
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${page}: ${resp.status}`);
		}
		const html = await resp.text();
		const main = html.match(MAIN)?.[0] ?? '';
		// "CarbonChain — Amasia" -> "CarbonChain"
		const name = clean(html.match(TITLE)?.[1] ?? '').replace(/\s+[—–-]\s+Amasia\s*$/i, '');
		const site = [...main.matchAll(SITE)].map(([, href]) => unescape(href)).find((href) => !/amasia\.vc/i.test(href));
		return { name, site: site ?? '', exited: EXITED.test(clean(main)) };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const opened = new Set<string>();
	for (const [item] of html.matchAll(ITEM)) {
		const linked = unescape(item.match(LIGHTBOX)?.[1] ?? '').trim();
		if (!linked) continue;
		const file = fileOf(item.match(IMAGE)?.[1] ?? '');
		// a page an earlier logo already opened is not this logo's
		const slug = opened.has(linked) ? file.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : linked;
		opened.add(linked);
		await wait(PACE_MS);
		const detail = slug ? await detailOf(slug) : null;
		if (!detail && slug === linked) {
			throw new Error(`amasia: no page for ${linked}`);
		}
		const name = detail?.name || file;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...clean(item.match(TAGS)?.[1] ?? '').split(','), detail?.exited ? 'Exited' : '']
				.map(tag)
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: detail?.site || (detail ? `${BASE_URL}/${slug}` : PAGE_URL)
		});
	}
	if (companies.length === 0) {
		throw new Error('amasia: no companies in the gallery');
	}

	return companies;
}
