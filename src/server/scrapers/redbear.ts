import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.redbear.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, server rendered, so the whole portfolio is in the page. the fund
// backs cornell founders and has ten companies; each is an article holding a
// logo linked to the company, its name, a line about it, who founded it, the
// sectors it works in, the round the fund came in at, and a badge for how the
// investment stands.
//
// a card's prose links out too — to where a founder used to work — so the
// address is taken from the logo's link, which is labelled for it.
//
// "active" is every company the fund still holds and says nothing, so only the
// badge of a company that has left is kept.
//
// two of the ten cards say "Stealth" instead of a name and link nowhere. two
// companies cannot both be filed under that, so they are left out until the
// fund says who they are — which is what having no name to read leaves anyway.

const ITEM = '<article class="grid gap-6 rounded-lg';
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*aria-label="[^"]*website"/;
const NAME = /<a href="https?:\/\/[^"]*"[^>]*class="font-serif[^"]*">([^<]*)<\/a>/;
const TAG = /<span class="rounded-full border border-ink-line bg-bg-tinted[^"]*">([^<]*)<\/span>/g;
const STATUS = /<span class="inline-flex items-center rounded-full[^"]*">([^<]*)<\/span>/;
// the badge every company the fund still holds carries
const HELD = /^active$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const status = clean(item.match(STATUS)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...[...item.matchAll(TAG)].map((m) => clean(m[1])),
				status && !HELD.test(status) ? status : ''
			]
				.filter(Boolean)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('redbear: no companies on the portfolio page');
	}

	return companies;
}
