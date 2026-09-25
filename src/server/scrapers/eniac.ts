import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.eniac.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page shows a hundred at a time, a "next" link
// leading on to the rest. every company is a card that opens into a popup
// naming it, telling where it is, who founded it and linking its site; the
// card carries hidden filter fields with its categories ("Healthcare",
// "SaaS") and an "Exited" badge that is left invisible on one still held.
// the fund writes how a company went into its name — "Anchor - Acquired by
// Spotify", "Boxed - Exited via IPO", once twice over — so the name is cut
// there and the rest kept, with the Exited tag, whether or not the badge is
// shown. a company without a site links to the page.

const ITEM = /(?=<div[^>]*class="companies-item w-dyn-item")/;
const NAME = /<h2 class="heading-xl align-v">([\s\S]*?)<\/h2>/;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const EXITED = /class="companies-exited"/;
const LOCATION = /Location<\/div>\s*<div>([\s\S]*?)<\/div>/;
const WEBSITE = /Website<\/div>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const NEXT = /<a\b[^>]*\bhref="(\?[^"]*_page=\d+)"[^>]*class="w-pagination-next"/;
const OUTCOME = /\s+-\s+(?=(?:exited|acquired|merged|ipo)\b)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Massachusetts, USA" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const fetched = new Set<string>();
	let url: string | undefined = PAGE_URL;
	while (url && !fetched.has(url) && fetched.size < 30) {
		fetched.add(url);
		const html = await fetchText(url);
		for (const chunk of html.split(ITEM).slice(1)) {
			const item = chunk.split('company-popup-close-button')[0];
			const [name, ...outcomes] = clean(item.match(NAME)?.[1] ?? '').split(OUTCOME);
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const exited = outcomes.length > 0 || EXITED.test(item);
			companies.push({
				name,
				category: [
					...[...item.matchAll(CATEGORY)].map((m) => tag(m[1])).filter((t) => !/^exited$/i.test(t)),
					tag(item.match(LOCATION)?.[1] ?? ''),
					...outcomes.map(tag),
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: unescape(item.match(WEBSITE)?.[1] ?? '') || PAGE_URL
			});
		}
		const next = html.match(NEXT)?.[1];
		url = next ? new URL(unescape(next), PAGE_URL).href : undefined;
	}

	if (companies.length === 0) {
		throw new Error('eniac: no companies on the companies page');
	}

	return companies;
}
