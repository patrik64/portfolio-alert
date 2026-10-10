import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://angularventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the portfolio page is a list of rows, each linking the company's
// site, or nothing on a few, with its name, a line about it, its
// categories and its cities ("AI, SaaS", "New York, Tel Aviv") as the
// filters read them, kept as tags, the year the fund partnered with it,
// kept as "Invested 2018", and "Acquired" on the ones the fund is out of.

const ROW = /(?=<div class="views-row">)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const FIELD = (name: string) => new RegExp(`<span class="${name}">([\\s\\S]*?)<\\/span>\\s*(?=<span class="\\w+"|<\\/a>)`);
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "AI, SaaS, Industrial" -> ["AI", "SaaS", "Industrial"]
const list = (s: string) =>
	clean(s)
		.split(/\s*,\s*/)
		.filter(Boolean);

// the fund's own server, hosted in israel, leaves the nightly run's
// connection unanswered on some nights where a laptop gets the page at once —
// on 5 October 2026 for longer than a single retry ten seconds later — so a
// request that fails that way, or with a server error, is asked again after
// longer and longer pauses, about two minutes in all, each try with a time
// limit so that a hang is not waited on forever.
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000];
const TIMEOUT_MS = 20_000;

async function fetchPage(): Promise<Response> {
	const get = () =>
		fetch(PAGE_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
	let failure: unknown;
	for (const delay of [0, ...RETRY_DELAYS_MS]) {
		if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
		try {
			const resp = await get();
			if (resp.status < 500 || delay === RETRY_DELAYS_MS.at(-1)) return resp;
			await resp.body?.cancel();
		} catch (err) {
			failure = err;
		}
	}
	// the way it failed to answer is worth a word, a dropped connection being
	// one thing and a timed-out one another
	const why = failure instanceof Error ? ((failure.cause as { code?: string })?.code ?? failure.message) : '';
	throw new Error(
		`angular: the fund's server did not answer, ${RETRY_DELAYS_MS.length + 1} tries over two minutes${why ? ` (${why})` : ''}`,
		{ cause: failure }
	);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetchPage();
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const field = (name: string) => row.match(FIELD(name))?.[1] ?? '';
		const name = clean(field('title'));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const acquired = clean(field('acquired'));
		const year = clean(field('partnered')).match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(row.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...list(field('category')),
				...list(field('geo')),
				year ? `Invested ${year}` : '',
				acquired,
				acquired ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('angular: no companies on the portfolio page');
	}

	return companies;
}
