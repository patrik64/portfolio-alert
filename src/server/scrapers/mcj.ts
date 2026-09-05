import type { ScrapedCompany } from './types';

const BASE_URL = 'https://mcj.vc';
const LIST_URL = `${BASE_URL}/portfolio?format=json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, and the portfolio is a collection rather than a gallery, so it
// answers in json: a company per record with the fund's own sector for it and
// its tags. the section on the capital page is a summary block capped at
// thirty, which is the newest of them rather than all; the collection behind
// it holds eighty-nine, and that is what is read.
//
// the company's address is not a field. it is somewhere in the write-up, which
// for the older half is an essay with thirty links in it — press, podcasts,
// founders' profiles — and for the newer half a Resources list. so a link is
// only taken as the company's own where its host bears the company's name,
// preferring the one that points at the site rather than into it; failing
// that, where the fund labels it "<company>'s website", which is how four of
// them are written whose address says something else entirely — Face Plant at
// eatfaceplant.com, Arch at getarch.com.
//
// seven companies name themselves nowhere in their own write-up, so they keep
// the fund's page for them, which is where the portfolio links anyway.
//
// the tags carry what a company does, which of atoms or bits it is, and
// whether it mitigates or adapts — all of them things about the company. two
// say which round the fund came in at instead, and those are left out.

const ROUND = /^(?:pre[-\s]?seed|seed|series\s+[a-z]|bridge)$/i;
const LINK = /<a\b[^>]*?\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

interface Item {
	title?: string;
	fullUrl?: string;
	body?: string;
	categories?: string[];
	tags?: string[];
}
interface Page {
	items?: Item[];
	pagination?: { nextPage?: boolean; nextPageUrl?: string };
}

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|’/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the same name written two ways — spaces, capitals and punctuation set aside
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the brand out of an address: "www.eatfaceplant.com" -> "eatfaceplant"
const hostKey = (url: string) => {
	try {
		const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		return key(labels[labels.length - 1] ?? '');
	} catch {
		return '';
	}
};

const atRoot = (url: string) => {
	try {
		return !new URL(url).pathname.replace(/\/+$/, '');
	} catch {
		return false;
	}
};

// the one link in a write-up that is the company itself
function addressOf(item: Item): string {
	const name = key(item.title ?? '');
	if (!name) return '';

	const links = [...(item.body ?? '').matchAll(LINK)]
		.map(([, url, text]) => ({ url, text: clean(text) }))
		.filter(({ url }) => !url.includes('mcj.vc'));

	// an address that carries the company's name is the company's, and the one
	// that points at the site beats the one that points at a page inside it
	const named = links.filter(({ url }) => {
		const host = hostKey(url);
		return host.length >= 3 && (host.startsWith(name) || name.startsWith(host));
	});
	const own = named.find(({ url }) => atRoot(url)) ?? named[0];
	if (own) return own.url;

	// failing that, the fund saying which link is the website
	const labelled = links.find(({ text }) => {
		if (!/\bwebsite\b/i.test(text)) return false;
		const said = key(text.replace(/\bwebsite\b/i, '').replace(/'s$/i, ''));
		return said.length >= 3 && (said.startsWith(name) || name.startsWith(said));
	});
	return labelled?.url ?? '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const items: Item[] = [];
	let next: string | undefined = LIST_URL;
	// the collection answers twenty at a time and says where the next twenty are
	for (let page = 1; next && page <= 20; page++) {
		const resp: Response = await fetch(next, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${next}: ${resp.status}`);
		}
		const found = (await resp.json()) as Page;
		items.push(...(found.items ?? []));
		next = found.pagination?.nextPage
			? `${BASE_URL}${found.pagination.nextPageUrl}&format=json`
			: undefined;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = clean(item.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...(item.categories ?? []), ...(item.tags ?? [])]
				.map(clean)
				.filter((tag) => tag && !ROUND.test(tag))
				.join(', '),
			url: addressOf(item) || (item.fullUrl ? `${BASE_URL}${item.fullUrl}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('mcj: no companies in the portfolio collection');
	}

	return companies;
}
