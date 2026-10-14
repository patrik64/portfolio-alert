import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.curiosityvc.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is three grids of cards, the whole of each in
// the page — the fund's companies, "Our Angel (Syndicate) portfolio" and
// "Investments at previous funds", the last being the partners' record at
// other firms, not the fund's, and left out. a card is a company's logo,
// with no alt text, a line about it and an "Exit" badge where the fund is
// out of it, linking the company's page here; the page alone names the
// company, in its title ("QA.tech | Curiosity Venture Capital"), and gives
// its industry, where it is ("Amsterdam, The Netherlands"), the year it was
// founded, its site and, for an exit, how it went ("Acquired By Zapier in
// 2025", "IPO at Nasdaq Baltics").
// the industry, the place, the year and the syndicate are kept as tags, an
// exit with the Exited tag and its buyer or listing. a card the fund keeps
// undisclosed is left out.
//
// a company without its page has no name to list it by, so a company page
// that will not load, or is not reached by the deadline, fails the run
// rather than leave the company out.

const SYNDICATE = 'Our Angel (Syndicate) portfolio';
const PREVIOUS = 'Investments at previous funds';
const CARD = /<a href="(\/portfolio-companies\/[^"]*)" class="w-inline-block">([\s\S]*?)<\/a>/g;
const BADGE = /class="bg-gradient-7 border">Exit</;
const TITLE = /<title>\s*([^<]*?)\s*\|\s*Curiosity Venture Capital\s*<\/title>/;
const FACT = (label: string) =>
	new RegExp(
		`<li class="bordered-list-item(?! w-condition-invisible)[^"]*">\\s*<div\\b[^>]*>\\s*<h6\\b[^>]*>${label}</h6>\\s*([\\s\\S]*?)</li>`
	);
const HREF = /<a href="([^"]*)"/;
const YEAR = /\b(?:19|20)\d{2}\b/;
// "Acquired By Zapier in 2025", "Team acquired by Lovable in 2026", "Acquired by DELL for $100M"
const BUYER = /\bacquired by\s+(.+?)(?:\s+(?:in|for)\b.*)?[.\s]*$/i;
const IPO = /^ipo\b/i;
const UNDISCLOSED = /^undisclosed\b/i;
const SYNDICATE_TAG = 'Angel Syndicate';
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

interface Details {
	name: string;
	site: string;
	industry: string;
	city: string;
	founded?: string;
	exit: string;
}

// a company page's name and facts; a page that will not give its name fails the run
async function detailsOf(href: string): Promise<Details> {
	const resp = await get(href);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${href}: ${resp.status}`);
	}
	const html = await resp.text();
	const name = clean(html.match(TITLE)?.[1] ?? '');
	if (!name) {
		throw new Error(`curiosity: ${href} names no company — the company pages' markup moved`);
	}
	const fact = (label: string) => html.match(FACT(label))?.[1] ?? '';
	const site = unescape(fact('Website').match(HREF)?.[1] ?? '').trim();
	return {
		name,
		site: /^https?:\/\//i.test(site) ? site : '',
		industry: clean(fact('Industry')),
		city: clean(fact('Location')),
		founded: clean(fact('Founding year')).match(YEAR)?.[0],
		exit: clean(fact('Exit'))
	};
}

// how an exit went, as a tag: "Acquired by Zapier", "IPO"
function wentTo(exit: string): string {
	const buyer = exit.match(BUYER)?.[1];
	if (buyer) return `Acquired by ${tag(buyer)}`;
	return IPO.test(exit) ? 'IPO' : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const syndicate = html.indexOf(SYNDICATE);
	const previous = html.indexOf(PREVIOUS);
	if (syndicate < 0 || previous < 0) {
		throw new Error("curiosity: the portfolio page's grids moved — the fund's own could not be told apart");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const match of html.matchAll(CARD)) {
		const at = match.index ?? 0;
		if (at > previous) continue;
		const [, path, card] = match;
		if (UNDISCLOSED.test(path.split('/').pop() ?? '')) continue;
		if (Date.now() - started >= DEADLINE_MS) {
			throw new Error('curiosity: the company pages ran past the deadline — the portfolio would be partial');
		}
		if (companies.length > 0) await wait(PACE_MS);
		const details = await detailsOf(new URL(unescape(path), BASE_URL).href);
		const { name } = details;
		if (UNDISCLOSED.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		if (details.site) withSite++;
		const exited = BADGE.test(card) || !!details.exit;
		companies.push({
			name,
			category: [
				tag(details.industry),
				...details.city.split(',').map(tag),
				details.founded ? `Founded ${details.founded}` : '',
				at > syndicate ? SYNDICATE_TAG : '',
				wentTo(details.exit),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: details.site || new URL(unescape(path), BASE_URL).href
		});
	}

	if (companies.length === 0) {
		throw new Error('curiosity: no companies on the portfolio page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("curiosity: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
