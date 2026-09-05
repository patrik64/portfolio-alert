import type { ScrapedCompany } from './types';

const CONTENT_URL = 'https://nphard.vc/api/content';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the fund's site is a terminal: a prompt, and a portfolio you reach by typing
// portfolio at it. there is no page to read and no url for one — every command
// draws from the one bundle of content the terminal loads on opening, and that
// is what is read here. typing the command only prints what has already
// arrived.
//
// a company comes with its own address, a line about what it does, its
// founders, and which of the fund's two vehicles it came in on. the vehicle is
// the fund's own rather than anything about the company, so it is left out the
// way vehicles are elsewhere — which leaves nothing to file a company under,
// since the fund records no sector, no stage and no exit. so every company
// here keeps no category.
//
// the terminal draws only the companies marked visible, and so does this.

interface Company {
	company?: string;
	website?: string;
	visible?: boolean;
}

interface Content {
	companies?: Company[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(CONTENT_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${CONTENT_URL}: ${resp.status}`);
	}

	let content: Content;
	try {
		content = (await resp.json()) as Content;
	} catch {
		throw new Error('nphard: the terminal came back with content that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of content.companies ?? []) {
		if (entry.visible === false) continue;

		const name = clean(entry.company ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url: clean(entry.website ?? '') });
	}

	if (companies.length === 0) {
		throw new Error('nphard: no companies in the terminal');
	}

	return companies;
}
