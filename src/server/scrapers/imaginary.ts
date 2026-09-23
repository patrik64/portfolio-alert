import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.imaginary.co/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the companies page is a wall of logos, each an image block
// linking the company's site, with no alt text and no caption. the image files
// are a poor guide — templates reused under other companies ("Skims (3).png"
// is nordic knots, two companies share "Bathhouse logo.png") — so a company is
// known by the address it links to, which holds still. the names below are
// what the companies call themselves, looked up once; a company missing from
// them is named after its address the way the other domain-named scrapers here
// do it, until it is added. a logo linking nowhere is named after its file.
const NAMES: Record<string, string> = {
	'abathhouse.com': 'Bathhouse',
	'alecsicecream.com': "Alec's Ice Cream",
	'berobrewing.com': 'Bero',
	'blackcrow.ai': 'Black Crow AI',
	'builder.io': 'Builder.io',
	'cerebelly.com': 'Cerebelly',
	'chachamatcha.com': 'Cha Cha Matcha',
	'chordcommerce.com': 'Chord',
	'daily-harvest.com': 'Daily Harvest',
	'daniellefrankelstudio.com': 'Danielle Frankel',
	'drinkcann.com': 'Cann',
	'eatayoh.com': 'Ayoh!',
	'eatmila.com': 'MìLà',
	'eatsantotaco.com': 'Santo Taco',
	'eon.xyz': 'EON',
	'farfetch.com': 'Farfetch',
	'getduos.com': 'Duos',
	'getsafely.com': 'Safely',
	'glossgenius.com': 'GlossGenius',
	'glossier.com': 'Glossier',
	'goodamerican.com': 'Good American',
	'goose.pet': 'Goose',
	'halfmagicbeauty.com': 'Half Magic',
	'hawthorne.co': 'Hawthorne',
	'humnutrition.com': 'HUM Nutrition',
	'jacquesmariemage.com': 'Jacques Marie Mage',
	'khy.com': 'Khy',
	'kosas.com': 'Kosas',
	'lore.world': 'Lore',
	'luckybevco.com': 'Lucky Energy',
	'mejuri.com': 'Mejuri',
	'necessaire.com': 'Nécessaire',
	'nordicknots.com': 'Nordic Knots',
	'nuorder.com': 'NuORDER',
	'povbeauty.com': 'POV Beauty',
	'realeactives.com': 'Reale Actives',
	'shiftsmart.com': 'Shiftsmart',
	'skims.com': 'Skims',
	'smalls.com': 'Smalls',
	'stripe.com': 'Stripe',
	'sundaysfordogs.com': 'Sundays for Dogs',
	'sweetchemistry.com': 'Sweet Chemistry',
	'teamcafeteria.com': 'Cafeteria',
	'thefeed.com': 'The Feed',
	'thereformation.com': 'Reformation',
	'thirtymadison.com': 'Thirty Madison',
	'tincan.kids': 'Tin Can',
	'universalstandard.com': 'Universal Standard',
	'usepepper.com': 'Pepper',
	'westmanatelier.com': 'Westman Atelier'
};

const BLOCK = /(?=<div[^>]*class="[^"]*\bfe-block\b)/;
const LINK = /<a[^>]*href="(https?:\/\/[^"]+)"/;
const FILE = /data-src="([^"]+)"/;

// the site's own sign-in for its investors sits among the logos
const NOT_COMPANIES = /(^|\.)carta\.com$/;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'drink', 'eat', 'team', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|shop)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

const titled = (s: string) =>
	s
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "getfoo.com" -> "Foo", "daily-harvest.com" -> "Daily Harvest"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return titled(label);
}

// "hook.png" -> "Hook"; a file that only says it is a logo, or is a numbered
// copy of another company's ("Skims (3).png"), names nobody
function fileName(src: string): string {
	const file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/\+/g, ' ')
		.trim();
	return /logo|website|\(\d+\)|^\d*$/i.test(file) ? '' : titled(file);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of html.split(BLOCK).slice(1)) {
		const src = block.match(FILE)?.[1];
		if (!src) continue;
		const url = block.match(LINK)?.[1] ?? '';
		const host = hostOf(url);
		if (host && NOT_COMPANIES.test(host)) continue;
		const name = host ? (NAMES[host] ?? domainName(host)) : fileName(src);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('imaginary: no company logos on the companies page');
	}

	return companies;
}
