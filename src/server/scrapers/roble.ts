import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.robleventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. a card gives the focus the fund files a company under, how
// far the company has come — "Seed → Series A", or "Exited" — the year, a line
// about what it does, and a logo linked to the company. what it never gives is
// the company's name.
//
// so the logo's filename names it where the two agree, which keeps Slang out of
// slangapp.com and UBITS in its own capitals; otherwise the company's domain
// does. that also settles the row where the fund left holly's logo on compa's
// card: "holly" has nothing to do with compa.as, so the domain wins.

const ITEM = '<div class="how-to-invest_career_portfolio-list_item padding-xsmall">';
const FOCUS = /fs-cmsfilter-field="Focus"[^>]*>([^<]*)<\/p>/g;
const STAGE = /fs-cmsfilter-field="Stage"[^>]*>([^<]*)<\/p>/g;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="how-to-invest_portfolio-card_link-wrapper/;
const LOGO = /<img src="([^"]*)"[^>]*class="how-to-invest_portfolio-list_card-logo"/;
const HASH_PREFIX = /^[0-9a-f]{18,}_/;
// what the fund calls a logo file besides the company
const DRESSING =
	/^(logos?|logotype|wordmark|white|black|colou?r|horizontal|vertical|website|design|untitled|final|new|transparent|\d+|[0-9a-f]{4,}|[0-9a-f-]{20,})$/i;
const MIN_LETTERS = 3;
const SUFFIX = /^(co|com)$/i;

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

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(url: string): string {
	try {
		const parts = new URL(url).hostname.replace(/^www\./, '').toLowerCase().split('.');
		if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
		return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? '');
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const site = item.match(SITE)?.[1] ?? '';
		const label = domainLabel(site);

		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(HASH_PREFIX, '')
			.replace(/\.\w+$/, '');
		const fromFile = file
			.split(/[^A-Za-z0-9]+/)
			.filter((w) => w && !DRESSING.test(w))
			.join(' ');

		// the filename names the company only where the domain bears it out
		const fileKey = key(fromFile);
		const labelKey = key(label);
		const agree =
			fileKey.replace(/[^a-z]/g, '').length >= MIN_LETTERS &&
			labelKey &&
			(labelKey.includes(fileKey) || fileKey.includes(labelKey));

		const name = capitalize(agree ? fromFile : label || fromFile);
		if (!name || seen.has(name)) continue;
		seen.add(name);

		companies.push({
			name,
			category: [
				...[...item.matchAll(FOCUS)].map((m) => clean(m[1])),
				...[...item.matchAll(STAGE)].map((m) => clean(m[1]))
			]
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('roble: no companies on the portfolio page');
	}

	return companies;
}
