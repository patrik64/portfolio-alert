import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.reachcapital.com';
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const PAGE_SIZE = 500;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the companies page arrives with sixteen of the hundred and
// thirty-three and no way to page through them — the rest come from the
// endpoint the focus-area filter posts to, which takes the query it should run
// and hands back the cards as markup. asking it for everything at once is what
// the filter does when nothing is ticked.
//
// the query has to be sent as form fields rather than as json, which is how
// jquery sends it, and it wants a nonce the theme fetches on page load.
//
// the rest api lists the same companies but exposes neither the address nor
// whether one has exited, both of which are on the cards.

const NONCE_URL = `${AJAX_URL}?action=reach_get_nonce`;
const ITEM = '<div class="reach-portfolio-card"';
const NAME = /reach-portfolio-card__title"> ([^<]*?) <\/div>/;
const TAG = /reach-portfolio-card__tag[^"]*"> ([^<]*?) <\/div>/g;
const SITE = /reach-portfolio-card__logo"> <a href="(https?:\/\/[^"]+)"/;
// the fund's word for a company that has left, which reads last
const EXIT = /^exits?$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const nonceResp = await fetch(NONCE_URL, {
		headers: { 'User-Agent': UA, Accept: 'application/json' }
	});
	if (!nonceResp.ok) {
		throw new Error(`Failed to fetch ${NONCE_URL}: ${nonceResp.status}`);
	}
	const nonce = ((await nonceResp.json()) as { data?: { nonce?: string } }).data?.nonce;
	if (!nonce) {
		throw new Error('reach: the site gave no nonce to ask for the companies with');
	}

	const body = new URLSearchParams({
		action: 'reach_portfolio_filter',
		nonce,
		'args[post_type]': 'portfolio',
		'args[posts_per_page]': String(PAGE_SIZE),
		'args[post_status]': 'publish',
		'args[fields]': 'ids',
		'args[orderby]': 'title',
		'args[order]': 'ASC',
		'args[sentence]': '1',
		'args[base_url]': `${BASE_URL}/companies/`
	});
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${AJAX_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags = [...item.matchAll(TAG)].map((m) => clean(m[1])).filter(Boolean);
		companies.push({
			name,
			category: [...tags.filter((t) => !EXIT.test(t)), ...tags.filter((t) => EXIT.test(t))].join(
				', '
			),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('reach: no companies came back from the portfolio filter');
	}

	return companies;
}
