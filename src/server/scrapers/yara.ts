import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.yaragrowthventures.com/our-investments/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-laid page: under "Our startup investments" a logo per company linking its
// site beside a line about it, "Acquired by Mosaic" or just "Acquired" on the sold
// ones. the logos' alt text can't name them, a third being blank or left from
// another logo copied, so the companies are named from a list looked up once, keyed
// by the address; one missing from it is named after its address until it is added.
// the section after, "Our venture fund investments", holds funds and is left out.
const NAMES: Record<string, string> = {
	'agrofy.com.ar': 'Agrofy',
	'agrolend.agr.br': 'Agrolend',
	'apolloagriculture.com': 'Apollo Agriculture',
	'azanefs.com': 'Azane Fuel Solutions',
	'boomitra.com': 'Boomitra',
	'boostbiomes.com': 'Boost Biomes',
	'dynelectro.dk': 'Dynelectro',
	'ecorobotix.com': 'ecoRobotix',
	'h2pro.co': 'H2Pro',
	'hydrogen-mem-tech.com': 'Hydrogen Mem-Tech',
	'intelecy.com': 'Intelecy',
	'jai-kisan.com': 'Jai Kisan',
	'plantresponse.com': 'Plant Response',
	'sabantoag.com': 'Sabanto',
	'stenon.io': 'Stenon',
	'tarfin.com': 'Tarfin',
	'verdagy.com': 'Verdagy',
	'verqor.com': 'Verqor'
};

const STARTUPS = 'Our startup investments';
const FUNDS = 'Our venture fund investments';
const LOGO = /(?=<a\b[^>]*\bhref="https?:\/\/[^"]+"[^>]*>\s*<img\b)/;
const SITE = /^<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const SOLD = />(?:\s|&nbsp;)*(?:<[^>]*>(?:\s|&nbsp;)*)*Acquired(?:\s+by\s+([^<&]+))?/i;

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (host: string) =>
	host
		.split('.')[0]
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const section = (await resp.text()).split(STARTUPS)[1]?.split(FUNDS)[0];
	if (!section) {
		throw new Error('yara: the startup section moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const part of section.split(LOGO).slice(1)) {
		const url = part.match(SITE)?.[1] ?? '';
		if (!url) continue;
		const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		const name = NAMES[host] ?? nameFrom(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sold = part.match(SOLD);
		const buyer = sold?.[1]?.trim().replace(/\s*,\s*/g, ' / ');
		companies.push({
			name,
			category: [buyer ? `Acquired by ${buyer}` : sold ? 'Acquired' : '', sold ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('yara: no companies on the investments page');
	}

	return companies;
}
