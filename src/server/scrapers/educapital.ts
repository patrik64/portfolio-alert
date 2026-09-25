import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.educapitalvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a card — a logo, a line about it, the theme the
// fund files it under ("Future of education") and, on one sold, an
// "Acquired" tag that is left invisible on the rest — turning over into
// "Discover" links to its site (or, for an app, its app store page). nothing
// names a company, so the names are kept here by the site's host, an app by
// its store slug; a card not yet known is named off its domain.

const ITEM = /(?=<div[^>]*class="portfolio_content w-dyn-item")/;
const LINK = /<a\b[^>]*?\bhref="([^"]+)"[^>]*class="portfolio_card-back/;
const CATEGORY = /class="fs-filter-category"[^>]*>([\s\S]*?)<\/div>/;
const TAG = /class="tag is-portfolio"[^>]*>([\s\S]*?)<\/div>/;
const STEALTH = /^stealth\b/i;

const NAMES: Record<string, string> = {
	'360learning.com': '360Learning',
	'appscho.com': 'AppScho',
	'buddy.ai': 'Buddy.ai',
	'chance.co': 'Chance',
	'codary.org': 'Complori',
	'cyberguru.it': 'Cyber Guru',
	'digischool.fr': 'digiSchool',
	'edflex.com': 'Edflex',
	'opendigitaleducation.com': 'Open Digital Education',
	'apps.apple.com/emma-parler-anglais': 'Emma',
	'engageli.com': 'Engageli',
	'evidenceb.fr': 'EvidenceB',
	'femaleinvest.com': 'Female Invest',
	'fourthrev.com': 'FourthRev',
	'happypal.fr': 'HappyPal',
	'prepacademy.fr': 'Hupso',
	'invivox.com': 'Invivox',
	'knowunity.co.uk': 'Knowunity',
	'labster.com': 'Labster',
	'lalilo.com': 'Lalilo',
	'lepaya.com': 'Lepaya',
	'livementor.com': 'LiveMentor',
	'lunii.com': 'Lunii',
	'makers.tech': 'Makers',
	'manzalab.com': 'Manzalab',
	'mendo.cloud': 'Mendo',
	'mentorshow.com': 'MentorShow',
	'merci-app.com': 'MerciApp',
	'muchbetter.ai': 'MuchBetter',
	'myedspace.co.uk': 'MyEdSpace',
	'nolej.io': 'Nolej',
	'oclock.io': "O'clock",
	'powerz.tech': 'Powerz',
	'preply.com': 'Preply',
	'rocapi.ne': 'Rocapine',
	'simundia.com': 'Simundia',
	'web.szl.ai': 'SZL',
	'studentpop.fr': 'StudentPop',
	'supermood.com': 'Supermood',
	'tomorrow.university': 'Tomorrow University',
	'apps.apple.com/vocal-image-coach-vocal-ia': 'Vocal Image',
	'wecandoo.fr': 'Wecandoo',
	'zestmeup.com': 'Zest'
};

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

// what a card is known by: the host of its site, without "www.", or for an
// app store page the app's slug
function keyOf(url: string): string {
	try {
		const { hostname, pathname } = new URL(url);
		const host = hostname.toLowerCase().replace(/^www\./, '');
		const app = host === 'apps.apple.com' ? pathname.match(/\/app\/([^/]+)/)?.[1] : undefined;
		return app ? `${host}/${app}` : host;
	} catch {
		return '';
	}
}

// a name read off a key, for a card not yet known: "newco.com" is Newco
function domainName(key: string): string {
	const label = (key.split('/').pop() ?? '').split('.')[0];
	return label ? label[0].toUpperCase() + label.slice(1) : '';
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
		const link = unescape(item.match(LINK)?.[1] ?? '').trim();
		const key = keyOf(link);
		const name = NAMES[key] ?? domainName(key);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = tag(item.match(TAG)?.[1] ?? '');
		companies.push({
			name,
			category: [tag(item.match(CATEGORY)?.[1] ?? ''), outcome, outcome ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: link || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('educapital: no companies on the portfolio page');
	}

	return companies;
}
