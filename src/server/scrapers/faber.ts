import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.faber.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static page with alpine: the portfolio grid is drawn from a list the
// page carries as json beside it — once a breakpoint, the copies the same —
// a company each with its name, its site, a line about it, the year the
// fund invested, the themes it falls under, by the keys the page's filter
// names ("ai" for "Applied Science & Digital Transformation", "clean-tech"
// for "Climate & Ocean Tech"), and whether the fund has exited it or it
// has died ("rip"). the themes the filter names and the year are kept as
// tags, an exit with the Exited tag, a company no longer running with the
// Closed tag.

const DATA = /<script type="application\/json">([\s\S]*?)<\/script>/;
const THEME = /<input id="[^"]*" name="theme"[^>]*\bvalue="([^"]*)"[^>]*>\s*<label[^>]*>\s*([^<]*?)\s*<\/label>/g;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	name?: string;
	url?: string;
	theme?: string;
	year?: number | string;
	exited?: boolean;
	rip?: boolean;
}

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
	const entries: Entry[] = JSON.parse(html.match(DATA)?.[1] ?? '[]');
	if (!Array.isArray(entries) || entries.length === 0) {
		throw new Error("faber: the page's list carries no portfolio — the page moved");
	}
	// the themes, by the key the filter shows each under
	const themes = new Map([...html.matchAll(THEME)].map(([, key, label]) => [key, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry?.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = String(entry.year ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = clean(entry.url ?? '');
		companies.push({
			name,
			category: [
				...String(entry.theme ?? '')
					.split(/\s+/)
					.map((key) => themes.get(key) ?? ''),
				year ? `Invested ${year}` : '',
				entry.exited ? 'Exited' : '',
				entry.rip ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			// a site that is the fund's own page is no site
			url: /^https?:\/\//i.test(site) && !/^https?:\/\/(?:www\.)?faber\.vc\b/i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('faber: the portfolio names no companies');
	}

	return companies;
}
