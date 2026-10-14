import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bynd.vc/en/portfolio';
// the pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow-built, served by the site: the portfolio page is a grid of cards,
// the whole of it in the page, a card a company named in its title and
// linking its site, with a line about it. the page's filters narrow the
// grid as an address (?status=2): the status shows the companies held
// ("Current", the page's own default) or the exits ("Exit"), never both,
// so each is read as a list; the iberian connection ("Portugal", "Spain")
// and the business model ("B2B", "B2C", "Sustainability") are read the
// same way within each. the connection and the model are kept as tags, an
// exit with the Exited tag. every list must load.

const FORM = /<form\b[^>]*class="portfolio-cards-filters"[\s\S]*?<\/form>/;
// the select's name, not its data-name ("Field 1")
const SELECT = /<select\b[^>]*\sname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g;
const OPTION = /<option value="([^"]+)"[^>]*>([^<]*)</g;
const CARD = /<a\b([^>]*)class="portfolio-card w-inline-block"([^>]*)>/g;
const TITLE = /\btitle="([^"]*)"/;
const HREF = /\bhref="([^"]*)"/;
const STATUS = 'status';
const EXIT = /^exits?$/i;
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

async function fetchText(url: string): Promise<string> {
	await wait(PACE_MS);
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

interface Card {
	name: string;
	href: string;
}

const cardsOf = (html: string): Card[] =>
	[...html.matchAll(CARD)].map(([, before, after]) => ({
		name: clean((before + after).match(TITLE)?.[1] ?? ''),
		href: unescape((before + after).match(HREF)?.[1] ?? '').trim()
	}));

// a bare address is a site too: "artiso.ai"
const siteOf = (href: string) =>
	/^https?:\/\//i.test(href)
		? href
		: /^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(href)
			? `https://${href}`
			: '';

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const filters = [...(html.match(FORM)?.[0] ?? '').matchAll(SELECT)].map(([, name, options]) => ({
		name,
		options: [...options.matchAll(OPTION)].map(([, value, label]) => ({ value, label: clean(label) }))
	}));
	const statuses = filters.find((filter) => filter.name === STATUS)?.options ?? [];
	if (statuses.length === 0) {
		throw new Error("bynd: the portfolio page's status filter moved — the exits could not be told apart");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const status of statuses) {
		const query = `${STATUS}=${encodeURIComponent(status.value)}`;
		const cards = cardsOf(await fetchText(`${PAGE_URL}?${query}`));
		// each other filter's companies within this status, by name
		const tags = new Map<string, string[]>();
		for (const filter of filters.filter((f) => f.name !== STATUS)) {
			for (const option of filter.options) {
				const narrowed = cardsOf(
					await fetchText(`${PAGE_URL}?${query}&${filter.name}=${encodeURIComponent(option.value)}`)
				);
				for (const { name } of narrowed) {
					tags.set(name.toLowerCase(), [...(tags.get(name.toLowerCase()) ?? []), tag(option.label)]);
				}
			}
		}

		for (const { name, href } of cards) {
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({
				name,
				category: [...(tags.get(name.toLowerCase()) ?? []), EXIT.test(status.label) ? 'Exited' : '']
					.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
					.join(', '),
				url: siteOf(href) || PAGE_URL
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('bynd: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
