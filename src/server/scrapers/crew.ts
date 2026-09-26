import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://crew.vc/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page is drawn by a script
// from a list written into the page, a record per company — the name, its
// sector, the stage the fund came in at, where it is, a status that reads
// "Active" or "Acquired by Autodesk", and its site.

const DATA = /const data_posts = (\[[\s\S]*?\]);\s*(?:const|var|let|<\/script>|\n)/;
const STEALTH = /^stealth\b/i;

type Names = string | string[] | null | undefined;

interface Post {
	title?: string;
	uri?: string;
	sector_name?: Names;
	stage_name?: Names;
	geography_name?: Names;
	acf?: { status?: string | null; website_url?: string | null };
}

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

// a label, or a list of them, as tags
const tags = (names: Names) => (Array.isArray(names) ? names : names ? [names] : []).map(tag).filter(Boolean);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const json = (await resp.text()).match(DATA)?.[1];
	if (!json) {
		throw new Error('crew: the companies page carries no list to draw');
	}
	const posts = JSON.parse(json) as Post[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = clean(post.acf?.status ?? '');
		const outcome = /^active$/i.test(status) ? '' : status;
		const exited = /\b(acquired|exited|ipo|merged|public)\b/i.test(outcome) || tags(post.stage_name).some((s) => /^acquired$/i.test(s));
		companies.push({
			name,
			category: [
				...tags(post.sector_name),
				...tags(post.stage_name).filter((s) => !/^acquired$/i.test(s)),
				...tags(post.geography_name),
				outcome ? tag(outcome) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(post.acf?.website_url ?? '') || clean(post.uri ?? '') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('crew: no companies in the list the page carries');
	}

	return companies;
}
