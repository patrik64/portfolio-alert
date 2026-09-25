import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.educationimpactfund.org/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// umbraco: every company is a card — a logo linking its site, the vision
// the fund backs it for, and on one the fund is out of an "EXITED" ribbon
// — laid out twice over for different screens. nothing names a company, so
// the names are kept here by the site's host; a card not yet known is named
// off its domain. the page files companies under nothing.

const CARD = /(?=<div class="card partner-card)/;
const EXITED = /^<div class="card partner-card[^"]*\bexited\b/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const NAMES: Record<string, string> = {
	'acadeum.com': 'Acadeum',
	'aprende.com': 'Aprende Institute',
	'hellobackpack.com': 'Backpack Healthcare',
	'bemyeyes.com': 'Be My Eyes',
	'careacademy.com': 'CareAcademy',
	'chalktalk.com': 'ChalkTalk',
	'concentriced.org': 'Concentric Educational Solutions',
	'core.edu': 'Core Education',
	'crafteducation.com': 'Craft Education',
	'empoweru.education': 'EmpowerU',
	'interplaylearning.com': 'Interplay Learning',
	'kyronlearning.com': 'Kyron Learning',
	'mainstay.com': 'Mainstay',
	'mentorcollective.org': 'Mentor Collective',
	'motivohealth.com': 'Motivo Health',
	'newapprenticeship.com': 'New Apprenticeship',
	'orijin.works': 'Orijin',
	'pathstream.com': 'Pathstream',
	'springboard.com': 'Springboard',
	'stellic.com': 'Stellic',
	'stepful.com': 'Stepful',
	'youscience.com': 'YouScience'
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// the host of an address, without its "www.", or nothing for none
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

// a name read off a host, for a card not yet known: "newco.com" is Newco
function domainName(host: string): string {
	const label = host.split('.')[0] ?? '';
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
	for (const chunk of html.split(CARD).slice(1)) {
		const card = chunk.split('</figure>')[0];
		const site = unescape(card.match(LINK)?.[1] ?? '').trim();
		const host = hostOf(site);
		const name = NAMES[host] ?? domainName(host);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: EXITED.test(card) ? 'Exited' : '', url: site || PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('eif: no companies on the portfolio page');
	}

	return companies;
}
