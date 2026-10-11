import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.korelyacapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a wall of logos, each linking the
// company's site and, on hover, a line about it — one the fund is out of
// saying so ("AI voice platform for connected devices (exited)"). the page
// writes no company's name: the logos carry none in their alt text, and the
// media library names them by their files ("VCo", "AB 13"). so each company
// is known by its site, and named here as the company names itself; a site
// not yet named fails the run, saying which, rather than a name being made
// up for it. nothing else sorts the companies.

// the companies' names, by the domain of the site the page links
const NAMES: Record<string, string> = {
	'abtasty.com': 'AB Tasty',
	'bitfury.com': 'Bitfury',
	'bolt.eu': 'Bolt',
	'chefclub.tv': 'Chefclub',
	'devialet.com': 'Devialet',
	'finn.auto': 'FINN',
	'getyourguide.com': 'GetYourGuide',
	'getyourguide.fr': 'GetYourGuide',
	'glovoapp.com': 'Glovo',
	'grover.com': 'Grover',
	'habyt.com': 'Habyt',
	'hokodo.co': 'Hokodo',
	'ifeelonline.com': 'ifeel',
	'jobteaser.com': 'JobTeaser',
	'junctionconnect.com': 'Junction',
	'kayrros.com': 'Kayrros',
	'ledger.com': 'Ledger',
	'memrise.com': 'Memrise',
	'mistral.ai': 'Mistral AI',
	'myrealtrip.com': 'MyRealTrip',
	'ohbibi.com': 'Oh BiBi',
	'ramp.network': 'Ramp Network',
	'rebellions.ai': 'Rebellions',
	'showpad.com': 'Showpad',
	'snips.ai': 'Snips',
	'synapse-medicine.com': 'Synapse Medicine',
	'upway.fr': 'Upway',
	'vestiairecollective.com': 'Vestiaire Collective',
	'wallapop.com': 'Wallapop',
	'we-o.com': 'WEO'
};

const CARD = /(?=<a\s+class="logo-container\b)/;
const HREF = /^<a\b[^>]*\bhref="([^"]*)"/;
const ABOUT = /<div class="text">([\s\S]*?)<\/div>/;
const EXITED = /\(\s*exited\s*\)/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// a site's name from the list, by its domain or one it sits under
// ("es.wallapop.com" -> "wallapop.com")
function nameOf(site: string): string | undefined {
	let host: string;
	try {
		host = new URL(site).hostname.toLowerCase();
	} catch {
		return undefined;
	}
	for (let at = host; at.includes('.'); at = at.slice(at.indexOf('.') + 1)) {
		if (NAMES[at]) return NAMES[at];
	}
	return undefined;
}

const hostOf = (site: string) => {
	try {
		return new URL(site).hostname;
	} catch {
		return site || '(no link)';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const unnamed: string[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const site = unescape(card.match(HREF)?.[1] ?? '').trim();
		const name = nameOf(site);
		if (!name) {
			unnamed.push(hostOf(site));
			continue;
		}
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: EXITED.test(clean(card.match(ABOUT)?.[1] ?? '')) ? 'Exited' : '',
			url: site
		});
	}

	// a company the list cannot name would otherwise go unlisted, or be
	// listed under a name the fund never gave it
	if (unnamed.length > 0) {
		throw new Error(`korelya: the portfolio links sites with no name in the scraper yet — ${unnamed.join(', ')}`);
	}
	if (companies.length === 0) {
		throw new Error('korelya: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
