import type { ScrapedCompany } from './types';

const LIST_URL = 'https://trousdale.vc/wp-json/wp/v2/company?per_page=100';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the "company" post type names every company and states its
// sector, with the label spelled out alongside the term id.
//
// the company's own address is only on the page the fund built for it, and
// the host answers 429 when asked for much at once — eighty-odd requests a
// night to collect them would be picking a fight — so each company points at
// its page here instead.
//
// even the one request is refused that way sometimes: wordpress.com turns down
// a burst and lets the same request through a few seconds later, which is what
// takes this fund down rather than anything about the feed. so it is asked for
// again when that happens, waiting as long as the host asks for where it says
// and backing off further each time where it does not.

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 3_000;
// however long the host asks for, waiting minutes on one fund would cost the
// night the rest of them
const MAX_WAIT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchFeed(): Promise<Post[]> {
	for (let attempt = 1; ; attempt++) {
		const resp = await fetch(LIST_URL, {
			headers: { 'User-Agent': UA, Accept: 'application/json' }
		});
		if (resp.ok) {
			try {
				return (await resp.json()) as Post[];
			} catch {
				throw new Error('trousdale: the portfolio feed came back in a shape that could not be read');
			}
		}
		if (resp.status !== 429 || attempt >= MAX_ATTEMPTS) {
			throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
		}
		const asked = Number(resp.headers.get('retry-after')) * 1000;
		await sleep(Math.min(asked > 0 ? asked : BACKOFF_MS * attempt, MAX_WAIT_MS));
	}
}

interface Post {
	title?: { rendered?: string };
	link?: string;
	taxonomy_info?: { sector?: { label?: string }[] };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const posts = await fetchFeed();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts ?? []) {
		const name = (post.title?.rendered ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: (post.taxonomy_info?.sector ?? [])
				.map((term) => (term.label ?? '').trim())
				.filter(Boolean)
				.join(', '),
			url: post.link ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('trousdale: no companies in the portfolio feed');
	}

	return companies;
}
