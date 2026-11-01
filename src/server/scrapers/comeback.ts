import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.comeback.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: a box per company that turns on hover from its logo, linked to its site, to
// its team's picture and a caption, "EXITED" written in the box on the sold ones. a
// few companies have two boxes. the name is only in the logo: the alt text is mostly
// blank, and the caption names the founder as often as the company, and several were
// left from another box when copied. so the companies are named from a list looked
// up once, keyed by the address; one missing from it is named after its address
// until it is added. Continuum has no link at all, and its caption has to do.
const NAMES: Record<string, string> = {
	'apprenticeshipamerica.com': 'Apprenticeship America',
	'aropha.com': 'Aropha',
	'bearabill.com': 'Bearabill',
	'beneverending.com': 'Neverending',
	'benefitbay.com': 'BenefitBay',
	'camlanngames.com': 'Camlann Games',
	'carbodylab.com': 'CarBodyLab',
	'carbonorigins.com': 'Carbon Origins',
	'cyrisma.com': 'Cyrisma',
	'dahsnft.com': 'Dapper Ape High Society',
	'digitalex.io': 'DigitalEx',
	'driverdoc.io': 'DriverDoc',
	'duality.ai': 'Duality',
	'fairwords.com': 'FairWords',
	'findyocal.com': 'Yocal',
	'flipcause.com': 'Flipcause',
	'floatme.com': 'FloatMe',
	'fusionos.ai': 'FusionOS',
	'getdriveway.com': 'Driveway',
	'gobloominghealth.com': 'Blooming Health',
	'grocerkey.com': 'GrocerKey',
	'hellosayge.com': 'Sayge',
	'hlrbo.com': 'HLRBO',
	'insightvoice.ai': 'InsightVoice',
	'joinincrement.com': 'Increment',
	'jugg.io': 'Jugg.io',
	'karyosoft.com': 'Karyosoft',
	'kuhmute.com': 'Kuhmute',
	'lincode.ai': 'Lincode Labs',
	'olimpwarehousing.com': 'Olimp Warehousing',
	'orbitalhealth.com': 'Orbital Health',
	'overeasyfoods.com': 'Over Easy',
	'path-robotics.com': 'Path Robotics',
	'pivotalhealth.care': 'Pivotal Health',
	'playfora.org': 'Playfora',
	'pluralpolicy.com': 'Plural',
	'precisionmeds.com': 'Precision Medicine',
	'preediction.com': 'Preediction',
	'prosperstack.com': 'ProsperStack',
	'qeepsake.com': 'Qeepsake',
	'reescommunity.com': 'Rees',
	'robbie.ai': 'Robbie AI',
	'scaleip.com': 'Scale IP',
	'scopify.ai': 'Scopify',
	'spokbee.com': 'Spokbee',
	'supplynow.org': 'SupplyNow',
	'supportpay.com': 'SupportPay',
	'taja.ai': 'Taja',
	'techmate.com': 'Techmate',
	'tourwithpineapple.com': 'Pineapple',
	'tryjeddy.com': 'Jeddy',
	'unitedmarket.com': 'United Market',
	'vernehq.com': 'Verne',
	'wiseful.co': 'Wiseful',
	'willcotech.com': 'WillCo Tech',
	'workhound.com': 'WorkHound',
	'xenaworkwear.com': 'Xena',
	'xploro.health': 'Xploro',
	'yourvone.com': 'VOne',
	'ziptility.com': 'Ziptility'
};

const BOX = /(?=<div id="comp-[a-z0-9]+" class="gpDCD5\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const OWN_HOST = /(?:comeback\.vc|wix\.com)$/;
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1>/g;
const EXITED = />EXITED</;
const CAPTION = /^(.+?),\s*(?:co-?founders?|team)\b/i;
const LINKEDIN_COMPANY = /\/company\/([^/?#]+)/;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const titled = (s: string) =>
	s
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

function nameOf(url: string): string {
	const { hostname, pathname } = new URL(url);
	const host = hostname.toLowerCase().replace(/^www\./, '');
	if (host.endsWith('linkedin.com')) return titled(pathname.match(LINKEDIN_COMPANY)?.[1] ?? '');
	return NAMES[host] ?? titled(host.split('.')[0]);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const boxes = (await resp.text()).split(BOX).slice(1);

	const companies = new Map<string, ScrapedCompany & { exited: boolean }>();
	for (const box of boxes) {
		const link = box.match(LINK)?.[1] ?? '';
		const url = link && !OWN_HOST.test(new URL(link).hostname) ? link.split(/[?&]gclid=/)[0] : '';
		const captions = [...box.matchAll(HEADING)].map(([, heading]) => clean(heading));
		const name = url ? nameOf(url) : (captions.map((caption) => caption.match(CAPTION)?.[1]).find(Boolean) ?? '');
		if (!name) continue;
		const company = companies.get(name.toLowerCase()) ?? { name, category: '', url, exited: false };
		company.exited ||= EXITED.test(box);
		companies.set(name.toLowerCase(), company);
	}

	if (companies.size === 0) {
		throw new Error('comeback: no companies on the portfolio page');
	}

	return [...companies.values()].map(({ name, url, exited }) => ({ name, category: exited ? 'Exited' : '', url }));
}
