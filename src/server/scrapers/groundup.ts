import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.groundup.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page. every card carries a
// lightbox naming the company and linking its site ("Visit Site"), with the
// fund's facts for it — its sector, where it is, the stage it is at now and
// the stage the fund came in at ("Pre-Seed", or "Via Acquisition" for a
// company that bought one the fund held) — and, for one that has been bought,
// the buyer ("Acquired by Zoom", "Screens acquired by Agiloft"). "Exit" as a
// stage marks the ones the fund is out of; "Other" as a place says nothing.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*w-dyn-item)/;
const NAME = /<div class="company-name">([\s\S]*?)<\/div>/;
const FACT = /<div class="tag-lightbox">([^<]*)<\/div>\s*<div class="tag-text\b[^"]*">([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*<div class="link">\s*Visit Site/i;
const SOLD_AS = /class="gp-cms-acquisition-label\b[^"]*">([\s\S]*?)<\/div>/;
const BUYER = /class="gp-cms-acquirer-name\b[^"]*">([\s\S]*?)<\/div>/;
const EXIT = /^exit(ed)?$/i;
const STEALTH = /^stealth\b/i;

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map([...item.matchAll(FACT)].map(([, label, value]) => [clean(label), tag(value)]));
		const stage = facts.get('Current Stage') ?? '';
		const invested = facts.get('Stage Invested') ?? '';
		const place = facts.get('Location') ?? '';
		const buyer = clean(item.match(BUYER)?.[1] ?? '');
		const sold = buyer ? tag(`${clean(item.match(SOLD_AS)?.[1] ?? '') || 'Acquired by'} ${buyer}`) : '';
		const exited = EXIT.test(stage) || Boolean(sold);
		companies.push({
			name,
			category: [
				facts.get('Sector') ?? '',
				/^other$/i.test(place) ? '' : place,
				EXIT.test(stage) ? '' : stage,
				invested ? `Invested ${invested}` : '',
				sold,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('groundup: no companies on the portfolio page');
	}

	return companies;
}
