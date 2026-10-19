import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.volitioncapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, each naming the company
// in a title that links its page on the fund's site (nine, mostly long
// exited, have no page and a bare title), over the sectors it is filed
// under ("Adtech", "Data, Analytics & Automation") and a line about it. a
// card's hidden detail block is headed "EXITED" for a company the fund is
// out of, and the line then usually opens with the buyer ("Acquired by
// PetSmart in 2017"), which is kept as "Acquired" without the buyer's name,
// the sentence being prose. no card links the company's own site: that is
// a link in the prose of its page on the fund's site, taken only when the
// link's text or host is the company's name, so a page is fetched for each
// company that has one, one at a time, within a time budget; a company
// whose page will not load, or names no such link, links its page on the
// fund's site instead, and one without a page links the portfolio.

const ITEM = /(?=<div class="pfgai-list-item">)/;
// the title, linked to the company's page or not: "<a href="…"> Chewy </a>"
// or a bare "Cohora "
const TITLE = /pfgai-list-item-title">\s*(?:<a href="([^"]*)">)?([^<]*)/;
const CATEGORY = /pfgai-list-item-category">([^<]*)</g;
const BLURB = /pfgai-list-item-sub-title">([\s\S]*?)<\/div>/;
const EXITED = /<h6>\s*EXITED\s*<\/h6>/;
const ANCHOR = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// links on a company's page that are not the company's own site
const NOISE =
	/volitioncapital\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|glassdoor\.com|imgix\.net|crunchbase\.com|google\.com|apple\.com/i;
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

// letters and digits only, for matching a name against a link
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's own site: the link in its page's prose whose text is the
// company's name ("Chewy.com" for Chewy) or whose host carries it
function siteOf(html: string, name: string): string {
	const k = key(name);
	for (const [, href, inner] of html.matchAll(ANCHOR)) {
		if (NOISE.test(href)) continue;
		let host: string;
		try {
			host = new URL(href).hostname.replace(/^www\./, '');
		} catch {
			continue;
		}
		const label = key(host.split('.').slice(0, -1).join(''));
		const text = key(clean(inner));
		const byHost = k.length >= 4 && (label.includes(k) || (label.length >= 4 && k.includes(label)));
		const byText = text.length > 0 && text.startsWith(k) && text.length - k.length <= 3;
		if (byHost || byText) return unescape(href);
	}
	return '';
}

// the page on the fund's site, or nothing when it will not load; a refusal
// is waited out once
async function pageOf(url: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			return await resp.text();
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const [, link = '', rawName = ''] = item.match(TITLE) ?? [];
		const name = clean(rawName);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = unescape(link).trim();
		const exited = EXITED.test(item);
		const blurb = clean(item.match(BLURB)?.[1] ?? '');
		let url = page || PAGE_URL;
		if (page && Date.now() - started < DEADLINE_MS) {
			await wait(PACE_MS);
			url = siteOf(await pageOf(page), name) || page;
		}
		companies.push({
			name,
			category: [
				...[...item.matchAll(CATEGORY)].map(([, c]) => tag(c)),
				exited && /\bacquired\b/i.test(blurb) ? 'Acquired' : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('volition: no companies on the portfolio page');
	}
	if (!companies.some((c) => c.category)) {
		throw new Error('volition: the sector markers moved');
	}

	return companies;
}
