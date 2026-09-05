import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.timoncapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio is a wall of linked logos and nothing else — no
// names in text, no sectors, no exit markers.
//
// most logos are filed under the fund's own template, "Timon_PortfolioPage_
// Logo_Schoolable", which names the company at the end. two were saved with
// the template's own placeholder name, one is a mangled "n.pngestcoin", and
// some are older than the company's current name — so a filename counts only
// where the company's hostname bears it out, and otherwise the hostname names
// the company itself.

const LINK = /sqs-block-image-link\s*"\s*href="(https?:\/\/[^"]+)"/g;
const LOGO = /\/([^/"?]+)\.(?:png|jpe?g|svg|webp)/i;

// the fund's file-naming, and what a logo file is called besides the company
const TEMPLATE = /^timon[_\s]*portfoliopage[_\s]*logo[_\s]*/i;
const DRESSING = /^(logos?|thumb|thumbnail|template\d*|png|\d+)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a word the fund wrote in capitals somewhere is spelled the way it spelled
// it — "mPharma" is not MPharma
const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) && !/[A-Z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

function nameFor(file: string, url: string): string {
	const raw = hostLabel(url);
	const host = key(raw);
	const bare = decodeURIComponent(file.replace(/\+/g, ' ')).replace(TEMPLATE, '');
	// the file as written, then the same with run-together words parted. the
	// first keeps mPharma and FarmWorks spelled as they are; the second is what
	// finds Bloc inside "blocLogo" and Kasi inside "KasiDataCenters"
	const readings = [bare, bare.replace(/([a-z])([A-Z])/g, '$1 $2')];

	for (const reading of readings) {
		const words = reading.split(/[^A-Za-z0-9]+/).filter((w) => w && !DRESSING.test(w));
		for (let len = words.length; len > 0; len--) {
			for (let start = 0; start + len <= words.length; start++) {
				const run = words.slice(start, start + len);
				const k = key(run.join(''));
				if (k.length > 1 && host.includes(k)) return capitalize(run.join(' '));
			}
		}
	}
	return capitalize(raw);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(LINK)) {
		const url = m[1];
		// the logo follows its link, so it is looked for after it
		const file = html.slice(m.index, m.index + 3000).match(LOGO)?.[1] ?? '';
		const name = nameFor(file, url);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('timon: no companies on the portfolio page');
	}

	return companies;
}
