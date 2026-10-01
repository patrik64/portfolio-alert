import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://pear.vc/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page is a list of boxes, a
// few drawn twice, each naming the company over its sector ("AI
// Applications"), a line about it and two labels, the stage pear came in
// at, in green ("Pre-seed"), and where the company stands now, in white
// ("Series A", or "Acquired" or "IPO" for the ones the fund is out of),
// the whole box linking the company's site. the sector and the stage pear
// came in at are kept as tags, and a sale or a listing as the way out; a
// standing short of that is left out, as it moves on and a stored row
// would not follow it. a few companies were renamed when the fund rebuilt
// its list, after they were stored; they keep the names they were stored
// under, as a name that moved would read as the old company leaving and a
// new one arriving.
const STORED_AS: Record<string, string> = {
	Cognition: 'Cognition Labs',
	Fieldbook: 'Flexport',
	'Real Sports': 'Real Sport',
	'Rely Health': 'Rely',
	'ViaGlobal Ventures': 'Via'
};

const BOX = /(?=<div class="companies-all-box\b)/;
const NAME = /<div class="left-area">\s*<h5\b[^>]*>([\s\S]*?)<\/h5>/;
const TAGS = /<div class="tags-area">([\s\S]*?)<\/div>/;
const STAGES = /<div class="stages-area">([\s\S]*?)<\/div>/;
const LABEL = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="stretched-link"/;
const OUT = /^(?:acquired|ipo|merged|exited)\b/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const box of html.split(BOX).slice(1)) {
		const written = clean(box.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sectors = [...(box.match(TAGS)?.[1] ?? '').matchAll(LABEL)].map(([, , label]) => tag(label));
		const labels = [...(box.match(STAGES)?.[1] ?? '').matchAll(LABEL)].map(([, attributes, label]) => ({
			now: /\bclass="[^"]*\bwhite\b/.test(attributes),
			label: tag(label)
		}));
		const entry = labels.find(({ now }) => !now)?.label ?? '';
		const standing = labels.find(({ now }) => now)?.label ?? '';
		const out = OUT.test(standing);
		const site = unescape(box.match(SITE)?.[1] ?? '')
			.replace(/#new_tab$/, '')
			.trim();
		companies.push({
			name,
			category: [...sectors, entry, out ? standing : '', out ? 'Exited' : '']
				.filter((t, i, all) => t && all.findIndex((other) => other.toLowerCase() === t.toLowerCase()) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('pear: no companies on the companies page');
	}

	return companies;
}
