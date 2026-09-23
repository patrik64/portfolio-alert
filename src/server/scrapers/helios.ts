import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.helioscapital.us/portfolio-2/';
// siteground's firewall answers 403 to chrome user-agent strings and lets
// safari through, as stray dog's does; an address it distrusts gets its
// captcha page instead, so the second attempt says plainly who is asking
const ATTEMPTS = [
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
	'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)'
];
const RETRY_DELAY_MS = 10_000;

// wordpress: the portfolio is a wall of logos, each linking the company's
// site, with no alt text, no caption, and image files named anything at all
// ("Capture1.png", "admin-ajax-1.jpg", cosmic shielding's "cognitive.jpg"). a
// company is known by the address it links to, which holds still; the names
// below are what the companies call themselves, looked up once, and one
// missing from them is named after its address the way the other
// domain-named scrapers here do it, until it is added. the fund's own logo
// sits at the end of the wall, linking nowhere.
const NAMES: Record<string, string> = {
	'allocations.com': 'Allocations',
	'argospace.com': 'Argo Space',
	'astra.com': 'Astra',
	'avttx.com': 'Ashvattha Therapeutics',
	'axiomspace.com': 'Axiom Space',
	'cognitivespace.com': 'Cognitive Space',
	'cosmicshielding.com': 'Cosmic Shielding',
	'energyx.com': 'EnergyX',
	'gravitics.com': 'Gravitics',
	'kelekona.com': 'Kelekona',
	'luminous.com': 'Luminous',
	'mojo.vision': 'Mojo Vision',
	'oncosenx.com': 'OncoSenX',
	'orbitfab.com': 'Orbit Fab',
	'radianaerospace.com': 'Radian Aerospace',
	'relativityspace.com': 'Relativity Space',
	'scout.space': 'Scout Space',
	'spacechannel.com': 'Space Channel',
	'spaceforge.com': 'Space Forge',
	'spacefund.com': 'SpaceFund',
	'spacex.com': 'SpaceX',
	'transastracorp.com': 'TransAstra',
	'type1ventures.com': 'Type One Ventures',
	'venusaero.com': 'Venus Aerospace',
	'volumetricbio.com': 'Volumetric Biotechnologies',
	'voyagerspaceholdings.com': 'Voyager Space',
	'xplore.com': 'Xplore'
};

const LOGO_LINK = /<a class="single-media-link" href="(https?:\/\/[^"]+)"/g;
const MARKER = 'uncode-single-media';

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// an answer without the logo wall is the firewall's, not the site's
	let html = '';
	let answer = '';
	for (const [attempt, ua] of ATTEMPTS.entries()) {
		if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': ua } });
		html = await resp.text();
		if (resp.ok && html.includes(MARKER)) break;
		const title = html.match(/<title[^>]*>([^<]*)</)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
		answer =
			`${resp.status}${title ? ` "${title}"` : ''}` + (/sgcaptcha/i.test(html) ? ", siteground's captcha" : '');
		html = '';
	}
	if (!html) {
		throw new Error(`helios: the site's firewall refused this address (${answer})`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url] of html.matchAll(LOGO_LINK)) {
		const host = hostOf(url);
		if (!host || host.endsWith('helioscapital.us') || seen.has(host)) continue;
		seen.add(host);
		const name = NAMES[host] ?? domainName(host);
		if (name) companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('helios: no company logos on the portfolio page');
	}

	return companies;
}
