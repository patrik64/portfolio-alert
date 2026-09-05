import type { ScrapedCompany } from './types';

const BASE_URL = 'https://relay.vc';
const REST_URL = `${BASE_URL}/wp-json/wp/v2/company?per_page=100`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const TABS = ['active', 'exited'];
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, and the fund splits what it knows over two places that neither of
// them holds together.
//
// the portfolio page draws a card per company — a photograph, a logo and a
// link to the company — but never writes a name down; the tabs above it fetch
// each half from admin-ajax, so both are asked for rather than only the one
// the page arrives showing. the rest api has the names and whether a company
// has left, but no addresses.
//
// so the companies are the rest api's, named as the fund records them, and the
// cards are matched onto them for their addresses. a card is matched on its
// logo's filename or the host it points at; where nothing matches with
// confidence the company simply keeps no address, which is also the honest
// answer for the three whose cards carry no link.
//
// two companies have a card but no record behind it. they are added from their
// cards, named by the logo's filename, which is the only place the fund writes
// them at all.

const CARD = '<div class="team-block">';
const LINK = /<a href="([^"]*)"/;
const LOGO = /team-logo">\s*<img src="([^"]*)"/;
const EXITED_TERM = 6;
const SUBDOMAIN = /^(www|app|en|us|ca)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
// how short a name may be before a partial match stops meaning anything
const MIN_MATCH = 4;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

function hostLabel(url: string): string {
	try {
		const parts = new URL(url).hostname
			.toLowerCase()
			.split('.')
			.filter((p) => !SUBDOMAIN.test(p));
		if (parts.length < 2) return parts[0] ?? '';
		if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
		return parts[parts.length - 2];
	} catch {
		return '';
	}
}

interface Card {
	url: string;
	file: string;
	fileKey: string;
	hostKey: string;
	exited: boolean;
	taken: boolean;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
	const resp = await fetch(url, {
		...init,
		headers: { 'User-Agent': UA, ...(init?.headers ?? {}) }
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const records = JSON.parse(await fetchText(REST_URL)) as {
		title?: { rendered?: string };
		slug?: string;
		company_status?: number[];
	}[];
	if (records.length === 0) {
		throw new Error('relay: the company collection came back empty');
	}

	const cards: Card[] = [];
	for (const tab of TABS) {
		const markup = await fetchText(AJAX_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `action=get_cat_post_data&post_cat=${tab}`
		});
		for (const block of markup.split(CARD).slice(1)) {
			const url = clean(block.match(LINK)?.[1] ?? '');
			const file = decodeURIComponent(block.match(LOGO)?.[1]?.split('/').pop() ?? '').replace(
				/\.\w+$/,
				''
			);
			cards.push({
				url,
				file,
				fileKey: key(file),
				hostKey: key(hostLabel(url)),
				exited: tab === 'exited',
				taken: false
			});
		}
	}

	// tried in order, so an outright match is never passed over for a partial one
	const tests: ((c: Card, k: string) => boolean)[] = [
		(c, k) => c.hostKey === k,
		(c, k) => c.fileKey === k,
		(c, k) => k.length >= MIN_MATCH && c.hostKey.includes(k),
		(c, k) => k.length >= MIN_MATCH && c.fileKey.includes(k),
		(c, k) => c.hostKey.length >= MIN_MATCH && k.includes(c.hostKey)
	];
	const cardFor = (k: string): Card | undefined => {
		if (!k) return undefined;
		for (const test of tests) {
			const hit = cards.find((c) => !c.taken && test(c, k));
			if (hit) return hit;
		}
		return undefined;
	};

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(record.title?.rendered ?? '');
		if (!name || seen.has(key(name))) continue;
		seen.add(key(name));
		const card = cardFor(key(name)) ?? cardFor(key(record.slug ?? ''));
		if (card) card.taken = true;
		companies.push({
			name,
			category: record.company_status?.includes(EXITED_TERM) ? 'Exited' : '',
			url: card?.url ?? ''
		});
	}

	// a card nobody claimed, and with an address on it, is a company the fund
	// shows but never recorded
	for (const card of cards) {
		if (card.taken || !card.url) continue;
		const name = clean(card.file.replace(/[^A-Za-z0-9]+/g, ' '));
		if (!name || seen.has(key(name))) continue;
		seen.add(key(name));
		companies.push({ name, category: card.exited ? 'Exited' : '', url: card.url });
	}

	return companies;
}
