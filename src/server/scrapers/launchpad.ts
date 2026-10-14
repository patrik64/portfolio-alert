import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.launchpadventuregroup.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the whole of the current portfolio, which the portfolio page only samples
const COMPLETE_URL = `${BASE_URL}/complete-portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: launchpad is an angel group, and its "complete portfolio"
// page lists the companies it holds under its sectors ("Healthcare & Life
// Science", "Enterprise Technology"), a line each — the company's name,
// linking its site, and what it does ("Groupize - group travel bookings
// made easy"). the portfolio page adds "Select Previous Investments", a
// line each for a company sold and its buyer ("Medumo - acquired by
// Philips"). the sector is kept as a tag, a sale with its buyer and the
// Exited tag. both pages must load.

const START = 'Complete Portfolio</span></h2>';
const PREVIOUS = 'Select Previous Investments';
const TOKEN = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<p\b[^>]*>([\s\S]*?)<\/p>/g;
const STRONG = /<strong>([\s\S]*?)<\/strong>/;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
// a line's name and what follows it: "Groupize - group travel bookings made easy"
const LINE = /^(.+?)\s+[-–—]\s+(.*)$/;
const BUYER = /^acquired by\s+(.+?)\.?$/i;
// a buyer's legal form, and a buyer the line leaves unnamed ("acquired by strategic buyer")
const FORM = /,?\s+(?:inc|llc|ltd|corp|corporation)\.?$/i;
const UNNAMED = /^(?:an?\s+)?(?:strategic|undisclosed|private)\s+(?:buyer|acquirer|company)$/i;
const IPO = /\bipo\b/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

interface Entry {
	name: string;
	rest: string;
	site: string;
	heading: string;
}

// the lines after a marker, each with the heading it sits under
function entriesAfter(html: string, marker: string): Entry[] {
	const at = html.indexOf(marker);
	if (at < 0) return [];
	const entries: Entry[] = [];
	let heading = '';
	for (const [, h3, p] of html.slice(at).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').matchAll(TOKEN)) {
		if (h3 !== undefined) {
			heading = clean(h3);
			continue;
		}
		const line = clean(p).match(LINE);
		if (!line) continue;
		// the name as the line sets it in bold, or the words before its dash
		const name = clean(p.match(STRONG)?.[1] ?? '') || line[1];
		entries.push({ name, rest: line[2], site: unescape(p.match(HREF)?.[1] ?? '').trim(), heading });
	}
	return entries;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const held = entriesAfter(await fetchText(COMPLETE_URL), START);
	if (held.length === 0) {
		throw new Error('launchpad: the complete portfolio lists no companies — the page moved');
	}
	const sold = entriesAfter(await fetchText(PAGE_URL), PREVIOUS);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const { name, rest, site, heading } of held) {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [tag(heading)].filter((t) => t && !UNSAID.test(t)).join(', '),
			url: /^https?:\/\//i.test(site) ? site : COMPLETE_URL
		});
	}
	for (const { name, rest, site } of sold) {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = rest.match(BUYER)?.[1].replace(FORM, '');
		companies.push({
			name,
			category: [
				buyer && !UNNAMED.test(buyer) ? `Acquired by ${tag(buyer)}` : IPO.test(rest) ? 'IPO' : '',
				'Exited'
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (withSite === 0) {
		throw new Error("launchpad: no company in the complete portfolio links its site — the page's markup moved");
	}

	return companies;
}
