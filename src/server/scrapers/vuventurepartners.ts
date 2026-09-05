import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.vuventurepartners.com/investments';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// strikingly ("Powered by Strikingly.com" in the first comment), server-rendered:
// six sections — Consumer, Enterprise, FinTech, Frontier, Healthcare, PropTech —
// each a logo grid linking the company sites, with the sector as the section
// heading. every logo has an empty alt and title and a numeric upload key
// ("106216/981112_98228.png"), and the text under it is a one-line pitch, not a
// name, so the hostname names the company, as for worklife and boxgroup. three
// logos carry no link at all and nothing else identifies them; they are skipped.

// generic second levels — "autolab.com.co" is Autolab, not Com
const GENERIC = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'ac']);
// the fund's own links; none of them is a logo link today, but the grid regex
// should not start picking them up if the layout changes
const NOT_A_COMPANY = /\/\/(?:[a-z0-9-]+\.)*(?:vuventurepartners\.com|typeform\.com|consider\.com)\b/i;
// one company is linked through its instagram profile rather than a site
const SOCIAL = /\/\/(?:[a-z0-9-]+\.)*(?:instagram\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com)\b/i;
// handle suffixes, not part of the name ("loradicarlo_hq")
const NOISE = /^(hq|official)$/i;

const decode = (s: string) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function nameFor(url: string): string {
	const parsed = new URL(url);
	let label: string;
	if (SOCIAL.test(url)) {
		// the profile handle, "instagram.com/loradicarlo_hq/" -> "loradicarlo_hq"
		label = decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[0] ?? '').replace(
			/^@/,
			''
		);
	} else {
		const labels = parsed.hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
		label = labels[labels.length - 1];
	}
	const words = label
		.split(/[-_+.]/)
		.filter((w) => w && !NOISE.test(w))
		.map(capitalize);
	return words.join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const body = html.split('<body')[1] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of body.split('id="section-').slice(1)) {
		// the sector heading, the one oversized line in the section
		const category = decode(section.match(/font-size: 160%[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
		for (const [, url] of section.matchAll(
			/<a href="(https?:\/\/[^"]+)"[^>]*aria-label="image link"/g
		)) {
			if (NOT_A_COMPANY.test(url) || seen.has(url)) continue;
			seen.add(url);
			const name = nameFor(url);
			if (!name) continue;
			companies.push({ name, category, url });
		}
	}

	if (companies.length === 0) {
		throw new Error('vuventurepartners: no companies on the investments page');
	}

	return companies;
}
