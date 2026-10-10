import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.join.capital';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the page's "Show more" button asks wordpress for the next eight companies
// here, and is answered with their strips and the number of the last page
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const PACE_MS = 150;
const MAX_PAGES = 50;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page shows eight companies, each a strip with
// its name, its fields ("Defence", "Enterprise"), a line about it, the
// years it was founded and the fund first invested, its headquarters
// ("Kista, SE", the country by its code) and a link to its site; one the
// fund is out of adds the year of the exit. the rest come eight at a time
// from the site's own endpoint, asked here the way the button asks it, page
// by page up to the last it names; a page that will not load fails the
// run, as the list would be short. the fields, the city, the country and
// the years are kept as tags, an exit with the Exited tag.

const STRIP = /(?=<div\s+class="portfolio-strip\b)/;
const NAME = /<h2\b[^>]*class="h4 bold"[^>]*>([\s\S]*?)<\/h2>/;
const CATS = /<div\s+class="portfolio-cats"\s*>([\s\S]*?)<\/div>/;
const CAT = /<span\b[^>]*>([\s\S]*?)<\/span>/g;
const FACT = /<p>\s*([^<]+?)\s*<br\s*\/?>\s*([^<]*?)\s*<\/p>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*Visit\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

// the codes the page gives a country by; "UK" is not the standard one
const SPELLED: Record<string, string> = { UK: 'United Kingdom', EU: 'Europe' };
let regions: Intl.DisplayNames | undefined;
try {
	regions = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
	regions = undefined;
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

const year = (s: string | undefined) => s?.match(/\b(?:19|20)\d{2}\b/)?.[0];

// "SE" -> "Sweden"; a country written out is kept as it is
function countryOf(written: string): string {
	if (!/^[A-Z]{2}$/.test(written)) return written;
	if (SPELLED[written]) return SPELLED[written];
	try {
		const name = regions?.of(written);
		return name && name !== written ? name : written;
	} catch {
		return written;
	}
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page of strips and the number of the last page
async function pageOf(paged: number): Promise<{ html: string; max: number }> {
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			Accept: 'application/json',
			'X-Requested-With': 'XMLHttpRequest',
			Referer: PAGE_URL
		},
		body: new URLSearchParams({ action: 'load_more_portfolios', paged: String(paged), cat: 'all' }).toString()
	});
	if (!resp.ok) {
		throw new Error(`join: page ${paged} of the portfolio would not load (${resp.status})`);
	}
	const answer = (await resp.json()) as { html?: string; max?: number | string };
	return { html: answer.html ?? '', max: Number(answer.max) || 0 };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let last = 1;
	for (let paged = 1; paged <= last && paged <= MAX_PAGES; paged++) {
		if (paged > 1) await wait(PACE_MS);
		const { html, max } = await pageOf(paged);
		last = max;
		const strips = html.split(STRIP).slice(1);
		if (strips.length === 0) {
			throw new Error(`join: page ${paged} of ${max} holds no companies — the markup moved`);
		}
		for (const strip of strips) {
			const name = clean(strip.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const facts = new Map<string, string>(
				[...strip.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)])
			);
			// "Kista, SE" -> the city and the country; "Italy" alone is the country
			const base = (facts.get('headquarters') ?? '').split(/\s*,\s*/).filter(Boolean);
			const country = base.length ? countryOf(base[base.length - 1]) : '';
			const founded = year(facts.get('founded'));
			const invested = year(facts.get('first invested'));
			const exited = year(facts.get('exit')) || facts.get('exit');
			const site = unescape(strip.match(SITE)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [
					...[...(strip.match(CATS)?.[1] ?? '').matchAll(CAT)].map(([, cat]) => tag(cat)),
					...base.slice(0, -1).map(tag),
					tag(country),
					founded ? `Founded ${founded}` : '',
					invested ? `Invested ${invested}` : '',
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
					.join(', '),
				url: site || PAGE_URL
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('join: no companies in the portfolio — the markup moved');
	}

	return companies;
}
