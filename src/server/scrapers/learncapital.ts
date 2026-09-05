import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.learn.vc/ventures';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over prismic, the whole portfolio in the page's __NEXT_DATA__:
// every venture carries its name, a link to the company's own address, the
// sector tags the fund files it under, and flags for the ones acquired or
// taken public.

// the tag has grown extra attributes on other sites, so any are allowed
const DATA = /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/;

interface Venture {
	tags?: string[];
	data?: {
		name?: { text?: string }[];
		visit?: { url?: string };
		acquired?: boolean;
		public?: boolean;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const blob = html.match(DATA)?.[1];
	if (!blob) {
		throw new Error('learncapital: the page carries no data to read the ventures from');
	}

	let ventures: Venture[];
	try {
		ventures =
			(JSON.parse(blob) as { props?: { pageProps?: { ventures?: Venture[] } } }).props?.pageProps
				?.ventures ?? [];
	} catch {
		throw new Error('learncapital: the page data could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const venture of ventures) {
		const name = clean(venture.data?.name?.[0]?.text ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				...(venture.tags ?? []).map(tag),
				venture.data?.acquired ? 'Exited' : '',
				venture.data?.public ? 'Public' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: venture.data?.visit?.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('learncapital: no ventures in the page data');
	}

	return companies;
}
