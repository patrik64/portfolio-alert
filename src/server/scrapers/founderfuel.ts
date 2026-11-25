import type { ScrapedCompany } from './types';

const BASE_URL = 'https://realventures.com';
// founderfuel.com has sent its visitors here, Real Ventures' own site, since 2026-11-24
const PAGE_URL = `${BASE_URL}/founderfuel`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app of Real Ventures', the accelerator's page drawn in the browser
// from records baked into the page's own script: every company that went
// through FounderFuel, with its site, its status ("active", "acquired",
// "shutdown"), its stage ("seed", "ma", "public"), its cohort ("2012-spring")
// and its sectors, and a line saying how it stands ("Acquired by Unity
// Technologies, March 2014"). the script is found through the app's entry
// module, whose file names carry a build hash, and the records are the
// objects in it that have a cohort and a status. an acquired company is an
// exit, its buyer kept when the line names one, as is one whose stage says
// "ma" or "public"; a company shut down folded rather than exited, and keeps
// the word only.

const ENTRY = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]*\/index-[\w-]+\.js)"/;
const PAGE_SCRIPT = /FounderFuelPage-[\w-]+\.js/;
const RECORD = '{name:`';
const STEALTH = /^stealth\b/i;

// "food-and-beverage-tech" -> "Food And Beverage Tech", "series-a" -> "Series A"
const titled = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => (word.length === 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
		.join(' ');

// "2012-spring" -> "Spring 2012", "2016" -> "2016"
const cohortOf = (slug: string) => {
	const [year, season] = slug.split('-');
	return season ? `${titled(season)} ${year}` : year;
};

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

// the record that opens at `start`, up to the brace that closes it; its
// strings are template literals, which may hold braces of their own
function recordAt(js: string, start: number): string {
	let depth = 0;
	for (let i = start; i < js.length; i++) {
		const ch = js[i];
		if (ch === '`') {
			for (i++; i < js.length && js[i] !== '`'; i++) if (js[i] === '\\') i++;
		} else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return js.slice(start, i + 1);
	}
	return '';
}

// a template literal's text, its escapes undone
const literal = (s: string) =>
	s.replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|[\s\S])/gi, (_, e: string) =>
		/^u/i.test(e) && e.length > 1
			? String.fromCodePoint(parseInt(e.replace(/[u{}]/gi, ''), 16))
			: e === 'n'
				? '\n'
				: e === 't'
					? '\t'
					: e
	);

const field = (record: string, name: string) =>
	literal(record.match(new RegExp(`[{,]${name}:\`((?:[^\`\\\\]|\\\\.)*)\``))?.[1] ?? '').trim();

const list = (record: string, name: string) =>
	[...(record.match(new RegExp(`[{,]${name}:\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/`((?:[^`\\]|\\.)*)`/g)].map(
		([, value]) => literal(value).trim()
	);

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const entry = html.match(ENTRY)?.[1];
	if (!entry) {
		throw new Error('founderfuel: no entry module on the page');
	}
	const entryUrl = new URL(entry, BASE_URL);
	const pageScript = (await fetchText(entryUrl.href)).match(PAGE_SCRIPT)?.[0];
	if (!pageScript) {
		throw new Error('founderfuel: the entry module names no FounderFuel page script');
	}
	const js = await fetchText(new URL(pageScript, entryUrl).href);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let at = js.indexOf(RECORD); at >= 0; at = js.indexOf(RECORD, at + 1)) {
		const record = recordAt(js, at);
		const status = field(record, 'activity');
		const cohort = field(record, 'cohort');
		if (!status || !/[{,]cohort:`/.test(record)) continue;
		const name = field(record, 'name');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stage = field(record, 'investment');
		// "Acquired by Unity Technologies, March 2014" -> the buyer, not the month
		const said = field(record, 'details');
		const sold = /^acquired by\b/i.test(said) ? tag(said.split(',')[0]) : '';
		const exited = status === 'acquired' || stage === 'ma' || stage === 'public';
		const site = field(record, 'url');
		companies.push({
			name,
			category: [
				...list(record, 'industries').map(titled),
				stage && stage !== 'ma' ? titled(stage) : '',
				cohort ? `Cohort ${cohortOf(cohort)}` : '',
				status === 'shutdown' ? 'Shutdown' : '',
				sold,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('founderfuel: no companies in the FounderFuel page script');
	}

	return companies;
}
