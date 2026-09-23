import type { ScrapedCompany } from './types';

const BASE_URL = 'https://group11.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const BATCH_SIZE = 8;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, with its rest api closed by a security plugin. the portfolio page
// is a wall of logos, with no alt text, sorted by isotope into the fund's
// stages — its classes say which, "exited" among them — each linking a page of
// the company's own. that page names the company, links its site ("Visit
// website") and lists the year the fund came in, the stage the company is at
// or how the fund got out ("Exited (Secondary)", "NASDAQ: NAVN …"), and its
// subsectors; those pages are fetched in batches. a page that will not load
// leaves its company out for the night rather than guessing a name for it,
// and too many of them fail the fetch. a company bought and gone "visits" the
// fund's own mantra page instead of a site, so it links to its page here.

const ITEM = /<li class="(isotopewrap\b[^"]*)">([\s\S]*?)<!-- end item -->/g;
const OWN_PAGE = /href="(https:\/\/group11\.vc\/portfolio\/[^"#?/]+\/?)"/;
const NAME = /<h2 class="page_title\b[^"]*">([\s\S]*?)<\/h2>/;
const SITE = /<div class="website_link">[\s\S]*?<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const FACT = /<li>\s*<strong>([^<]*)<\/strong>([\s\S]*?)<\/li>/g;
const OWN_SITE = /^https?:\/\/(www\.)?group11\.vc\b/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// a fact's colon sits inside the bold label or just after it
const fact = (s: string) => clean(s).replace(/^[:\s]+|[:\s]+$/g, '');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// "Exited (Acquisition)" -> "Acquisition", "NASDAQ: NAVN ($25/share, …)" ->
// "NASDAQ: NAVN", "Early Stage (Series A to B)" -> "Early Stage"
function stageOf(stage: string): string {
	const exit = stage.match(/^exited\s*\(([^)]*)\)/i);
	if (exit) return exit[1].trim();
	if (/^exited$/i.test(stage)) return '';
	return stage.replace(/\s*\([^)]*\)/g, '').replace(/\s*,\s*/g, ' / ').trim();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const listed = new Map<string, boolean>();
	for (const [, classes, item] of html.matchAll(ITEM)) {
		const page = item.match(OWN_PAGE)?.[1];
		if (page && !listed.has(page)) listed.set(page, /\bexited\b/.test(classes));
	}
	if (listed.size === 0) {
		throw new Error('group11: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const pages = [...listed];
	for (let i = 0; i < pages.length; i += BATCH_SIZE) {
		const batch = pages.slice(i, i + BATCH_SIZE);
		const details = await Promise.all(batch.map(([page]) => fetchText(page).catch(() => '')));
		batch.forEach(([page, exited], j) => {
			const name = clean(details[j].match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
			seen.add(name.toLowerCase());
			const facts = new Map(
				[...details[j].matchAll(FACT)].map(([, label, value]) => [fact(label).toLowerCase(), fact(value)])
			);
			const sectors = (facts.get('fintech subsector') ?? facts.get('sector') ?? '')
				.split(/\s*,\s*/)
				.filter(Boolean);
			const year = (facts.get('initial year invested') ?? '').match(YEAR)?.[0];
			const site = unescape(details[j].match(SITE)?.[1] ?? '');
			companies.push({
				name,
				category: [
					...sectors,
					stageOf(facts.get('current stage') ?? ''),
					year ? `Invested ${year}` : '',
					exited ? 'Exited' : ''
				]
					.filter((t, k, all) => t && all.indexOf(t) === k)
					.join(', '),
				url: site && !OWN_SITE.test(site) ? site : page
			});
		});
	}

	if (companies.length < listed.size * 0.9) {
		throw new Error(`group11: named ${companies.length} of the ${listed.size} companies listed`);
	}

	return companies;
}
