import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.gobi.vc/portfolio';
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos, twenty-five to a page behind
// webflow's own "next" links, which finsweet's filters read on the page. each
// logo links the company's site — or "#N/A" when there is none — and carries
// the filters' fields: its name, its country, its region, one industry, and
// whether it is live or exited. an exited company wears a tag saying how
// ("IPO (NASDAQ: AMBR)", "Acquired (Alibaba)"), kept with the Exited tag. the
// fields are written in capitals ("DEEP TECH & SEMICONDUCTORS", "HONG
// KONG"), so they are set in title case here; the names are kept as written.

const LIST = /(?=<div[^>]*class="[^"]*\bw-dyn-list\b)/;
// the grid's items, as opposed to the style sheet's rules for them in the head
const LOGO_ITEM = 'class="our-portfolio_portfolio_logo-item';
const ITEM = /(?=<div[^>]*role="listitem")/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"/;
const OUTCOME = /<div class="tag"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const EXIT_NOTE = /\b(ipo|acquired|merged|exit(ed)?)\b/i;
const STEALTH = /^stealth\b/i;
// the words title case would get wrong
const WORDS: Record<string, string> = { saas: 'SaaS', ai: 'AI', ar: 'AR', vr: 'VR' };

const field = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([\\s\\S]*?)<\\/(?:div|p)>`);
const NAME = field('title');
const COUNTRY = field('location');
const INDUSTRY = field('industry');
const STATUS = field('status');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "HEALTH, BIO & CARE" -> "Health / Bio & Care"
const titled = (s: string) =>
	tag(s)
		.toLowerCase()
		.replace(/[a-z]+/g, (word) => WORDS[word] ?? word[0].toUpperCase() + word.slice(1));

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();
		const list = html.split(LIST).find((l) => l.includes(LOGO_ITEM)) ?? '';

		for (const item of list.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			// the outcome tag shows unless webflow's conditional visibility hides it
			const hidden = /class="tag w-condition-invisible"/.test(item);
			const shown = hidden ? '' : tag(item.match(OUTCOME)?.[1] ?? '');
			const outcome = EXIT_NOTE.test(shown) ? shown : '';
			const exited = /^exit/i.test(clean(item.match(STATUS)?.[1] ?? '')) || Boolean(outcome);
			const link = unescape(item.match(SITE)?.[1] ?? '');
			companies.push({
				name,
				category: [
					titled(item.match(INDUSTRY)?.[1] ?? ''),
					titled(item.match(COUNTRY)?.[1] ?? ''),
					/^exit(ed)?$/i.test(outcome) ? '' : outcome,
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(link) ? link : ''
			});
		}

		const next = list.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('gobi: no companies in the portfolio grid');
	}

	return companies;
}
