import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.supernode.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace list section. everything about a company is one block of prose:
// its name in bold, then what it does, then the rounds the fund took part in
// and the stage the company is at now. the logos carry no alt text and nothing
// links out, so the fund publishes no addresses.
//
// two things the fund writes into the name have to come out of it, because a
// name that changes when a company's circumstances do would read as a new
// company: the "(Acquired)" / "(Closed)" / "(Exited)" it appends to a company
// that has left, and the "(f/k/a ...)" it keeps beside one that has renamed.
// both are recorded elsewhere — the status as a tag, the old name not at all.

const ITEM = '<div class="list-item-content__description';
const BOLD = /<strong>([\s\S]*?)<\/strong>([\s\S]?)/;
const STAGE = /Current Stage[\s\S]{0,30}?<\/strong>\s*:?\s*([\s\S]*?)<\/p>/;
const STATUS = /\((Acquired|Closed|Exited)\)/i;
const FORMERLY = /\s*\((?:f\/k\/a|fka)[^)]*\)/gi;
// a stage the fund writes as "Acquired: $100m" says the same as "Acquired"
const LEFT = /^(acquired|exited|closed)\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const body = item.split('</div>')[0];
		const bold = body.match(BOLD);
		if (!bold) continue;

		// the fund's bolding runs one letter into the sentence on one entry,
		// leaving "by Humankind i" where the company is "by Humankind": if the
		// bold text ends mid-word, the part-word at its end is not the name
		let raw = unescape(bold[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
		if (raw && !/\s$/.test(raw) && /[a-z]/i.test(bold[2] ?? '')) {
			raw = raw.replace(/\S+$/, '');
		}

		const status = raw.match(STATUS)?.[1];
		const name = raw.replace(STATUS, '').replace(FORMERLY, '').replace(/\s+/g, ' ').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const stage = clean(body.match(STAGE)?.[1] ?? '').replace(/^:\s*/, '');
		const tags = [
			LEFT.test(stage) ? capitalize(stage.split(':')[0].trim()) : stage,
			status ? capitalize(status) : ''
		];
		companies.push({
			name,
			// a company that has left is often both staged and marked as gone,
			// and the two say the same thing
			category: [...new Set(tags.filter(Boolean))].join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('supernode: no companies on the portfolio page');
	}

	return companies;
}
