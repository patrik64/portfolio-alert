import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.redswanventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. a card carries a logo, a line about what the company does,
// up to four sectors, a badge if the company has left, and a link to it — but
// no name, and the logos carry no alt text either.
//
// the name comes from the logo's filename, which the fund keeps as the
// company's own slug: "warby-parker", "juniper-square", "cambrian-genomics".
// they are unique across the page and every card has one, so unlike rtp's the
// domain is never needed to break a tie — which is as well, because a third of
// the addresses here now point at whoever bought the company (relayriders at
// turo, tradesy at vestiaire collective, rjmetrics at adobe) and would name
// the wrong company entirely.
//
// eleven companies have no link; webflow writes those as "#".

const ITEM = '<div role="listitem" class="portfolio_list_item w-dyn-item">';
const LOGO = /src="([^"]*)"[^>]*class="portfolio_logo"/;
const SITE = /href="([^"]*)" class="u-cover-absolute/;
const TAG = /class="card_text_tag">([^<]*)</g;
// webflow renders the badge for a company still held, but hides it
const EXITED = '<div class="exited_block">';
const HASH_PREFIX = /^[0-9a-f]{18,}[-_]/;
// what a logo file is called besides the company
const DRESSING = /^(?:logos?|logotype|wordmark|icon|white|black|dark|light|final|new|copy)$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the slug is split on its separators only — a dot inside one is part of the
// name the fund wrote, as id.me is
const capitalize = (s: string) =>
	s
		.split(/[-_\s]+/)
		.filter((w) => w && !DRESSING.test(w))
		.map((w) => (/^ai$/i.test(w) ? 'AI' : /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(/\.\w+$/, '')
			.replace(HASH_PREFIX, '');
		const name = capitalize(file);
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const site = clean(item.match(SITE)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...[...item.matchAll(TAG)].map((m) => clean(m[1])),
				item.includes(EXITED) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: site.startsWith('http') ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('redswan: no companies on the portfolio page');
	}

	return companies;
}
