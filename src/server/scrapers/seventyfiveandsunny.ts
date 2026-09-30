import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.75andsunny.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is two galleries of logos, the
// companies the fund holds and, under "Past Investments", the ones it is
// out of, each of those captioned with how it went ("IPO", "Acquired by
// ATG"). every logo links a site and none is named — the images' alt text
// is "Portco logos (77).png" — so the names are kept here: the held
// companies by the address a logo links, as the logos read, and the past
// ones by their images, since a few of them link a buyer's site, or the
// wrong one, and two would fall together. an address not listed here
// still imports, named after itself the way the other domain-named
// scrapers do it, until it is added.
const NAMES: Record<string, string> = {
	'airvet.com': 'Airvet',
	'allvoices.co': 'AllVoices',
	'apexspace.com': 'Apex',
	'arrivedhomes.com': 'Arrived',
	'blockchain.com': 'Blockchain.com',
	'blockrenovation.com': 'Block',
	'boostedcommerce.com': 'Boosted Commerce',
	'bridebook.com': 'Bridebook',
	'butterflymx.com': 'ButterflyMX',
	'cameo.com': 'Cameo',
	'canopy.space': 'Canopy',
	'carta.com': 'Carta',
	'closingtheory.com': 'Closing Theory',
	'community.com': 'Community',
	'crexi.com': 'Crexi',
	'flow.space': 'Flowspace',
	'flyhomes.com': 'Flyhomes',
	'goodcall.com': 'Goodcall',
	'hivemapper.com': 'Hivemapper',
	'hostgpo.com': 'HostGPO',
	'intro.co': 'Intro',
	'jointopo.com': 'Topography Health',
	'lahaus.com': 'LaHaus',
	'lessen.com': 'Lessen',
	'luxurypresence.com': 'Luxury Presence',
	'marketerhire.com': 'MarketerHire',
	'nomadhomes.co': 'Nomad',
	'pacaso.com': 'Pacaso',
	'permitflow.com': 'PermitFlow',
	'radiusagent.com': 'Radius',
	'rebuildmanufacturing.com': 'Re:Build Manufacturing',
	'relativityspace.com': 'Relativity Space',
	'replify.ai': 'Replify',
	'rho.co': 'Rho',
	'route.com': 'Route',
	'runway.com': 'Runway',
	'sensibleweather.com': 'Sensible Weather',
	'setpoint.io': 'Setpoint',
	'sidekickdata.io': 'Sidekick',
	'sideinc.com': 'Side',
	'snackpass.co': 'Snackpass',
	'spacex.com': 'SpaceX',
	'sparktoro.com': 'SparkToro',
	'speechify.com': 'Speechify',
	'stability.ai': 'Stability AI',
	'studio.com': 'Studio',
	'superplastic.co': 'Superplastic',
	'synd.io': 'Syndio',
	'tomonetworks.com': 'Tomo',
	'varomoney.com': 'Varo',
	'virtahealth.com': 'Virta',
	'voiscooters.com': 'Voi',
	'vts.com': 'VTS',
	'wavexr.com': 'Wave',
	'withyoursquad.com': 'Squad',
	'x-claim.com': 'Xclaim'
};

// the past investments, by the id in their images' paths
const PAST: Record<string, string> = {
	'0cbcd7cb-4146-43ab-9a63-662d6b46936b': 'Room 77',
	'0dea665d-5ad0-4191-928e-a8d0e3828069': 'TurnKey Vacation Rentals',
	'1545c799-f75f-4305-a680-24a75ea75cbe': 'Offerpad',
	'1614901727629-A8X53U1Z2QEJC90055KM': 'Pro.com',
	'228920b6-a1a9-4b20-adfd-9fe1604016d6': 'Chairish',
	'434962f3-398d-425a-8a66-1cdac0317d6e': 'Kona',
	'445ca6b0-6f11-483b-b261-3f7c5ee4739b': 'Accolade',
	'46cb4d4b-894f-4580-b1bd-38629b693ada': 'Domicile',
	'526d8543-f078-4a35-b3a7-99d403e4f4bc': 'Stack Overflow',
	'662558f2-ca54-4e89-ae3c-76f34cc108e2': 'Mojo',
	'6f5517c8-db45-47f7-ac3c-753a0de92c48': 'Doma',
	'7b6d49aa-913b-4e2e-abb5-df2dd27a23f9': 'Vamo',
	'7fde1f5f-d876-405d-9321-3f02d8cefb31': 'Zillow',
	'812cb111-4199-49d1-b0ea-b1ee93bfeb3c': 'PointsHound',
	'b468e95a-2a6d-47e2-86b7-431f0740aae9': 'Glassdoor',
	'b51b8123-d8e1-4b24-a0cc-b3a1ac979a78': 'Palantir',
	'b99e15b3-dea0-45af-aac4-678b17be8c44': 'Julep',
	'c4c9f43b-7580-4309-9075-5777b1232725': 'Robinhood',
	'c76c33f5-d67b-4ba1-8b4a-8f785f9601a8': 'Switchfly',
	'e429a23c-09d2-41bc-a084-ca089728382f': 'Hotwire',
	'ed117d61-f259-4a8d-ad5b-e43ae477f3ac': 'Liftopia',
	'ede2387b-96dc-4981-aa54-b88b3c1d32a7': 'Remitly',
	'ee8909ba-21c8-4c44-afc7-dc7cf329ab1d': 'XPeng',
	'f888e8b9-7041-4cb3-93ff-8dac2035188a': 'Dwellable',
	'fd52e997-1330-43eb-871c-6fb24c90bce9': 'Rigetti'
};

const ITEM = /(?=<figure class="gallery-grid-item\b)/;
const PAST_HEADING = /Past Investments/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="gallery-grid-image-link"/;
const IMAGE = /\bdata-src="([^"]*)"/;
const CAPTION = /class="gallery-caption-content"[^>]*>([\s\S]*?)<\/div>/;
const STEALTH = /^stealth\b/i;

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

// "…/content/v1/603e9c…/445ca6b0-6f11-…/Portco+logos+(58).png" -> "445ca6b0-6f11-…"
const imageId = (src: string) => src.split(/[?#]/)[0].split('/').slice(-2, -1)[0] ?? '';

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
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const pastAt = html.search(PAST_HEADING);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let at = 0;
	for (const item of html.split(ITEM).slice(1)) {
		at = html.indexOf(item, at);
		const past = pastAt >= 0 && at > pastAt;
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const named = past ? PAST[imageId(item.match(IMAGE)?.[1] ?? '')] : undefined;
		const name = named ?? (host ? (NAMES[host] ?? domainName(host)) : '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = past ? tag(item.match(CAPTION)?.[1] ?? '') : '';
		companies.push({
			name,
			category: [went, past ? 'Exited' : ''].filter(Boolean).join(', '),
			url: host ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('75andsunny: no companies in the galleries');
	}

	return companies;
}
