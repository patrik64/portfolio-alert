import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://axonpartnersgroup.com/portfolio/';
// the pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with search & filter: the portfolio page is a grid of cards,
// seventy a page (?sf_paged=2), a card a company with its logo, its name, a
// line about it and a link to its site, the page counting them ("Found 100
// Results"). the cards carry nothing of the page's filters — the strategy
// ("ClimaTech", "Growth"), the status ("Current", "Past") and the industry
// ("Enterprise", "Energy transition") — but the page answers each filter as
// an address (?_sft_industry=fintech), so each is read as a list of its
// own. the strategy and the industry are kept as tags, a company the fund
// is past with the Exited tag. every page of every list must load, and a
// list holding fewer cards than it counts fails the run rather than pass
// for the whole.

const CARD = /(?=<div class="blog-post"[^>]*>)/;
const NAME = /<h4 class="has-medium-font-size wp-block-heading"[^>]*>([\s\S]*?)<\/h4>/;
const SITE = /<a href="([^"]*)" class="external-link"/;
const FOUND = /Found (\d+) Results<br \/>\s*Page \d+ of (\d+)/;
// a filter's option: <input class="sf-input-radio" type="radio" value="fintech" name="_sft_industry[]" …><label …>Fintech</label>
const OPTION =
	/<input\s+class="sf-input-radio"\s+type="radio"\s+value="([^"]+)"\s+name="(_sft_[a-z_]+)\[\]"[^>]*>\s*<label class="sf-label-radio"[^>]*>([^<]*)<\/label>/g;
const STATUS = '_sft_portfolio_status';
const PAST = /^past$/i;
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

// a list's cards, every page of it, checked against the count it gives
async function cardsOf(query: string): Promise<{ cards: string[]; html: string }> {
	const cards: string[] = [];
	let first = '';
	let pages = 1;
	for (let page = 1; page <= pages && page <= MAX_PAGES; page++) {
		const params = [query, page > 1 ? `sf_paged=${page}` : ''].filter(Boolean).join('&');
		const url: string = params ? `${PAGE_URL}?${params}` : PAGE_URL;
		const html: string = await fetchText(url);
		if (page === 1) first = html;
		const found = html.match(FOUND);
		if (found) pages = Number(found[2]);
		cards.push(...html.split(CARD).slice(1));
	}
	const counted = Number(first.match(FOUND)?.[1] ?? 0);
	if (cards.length < counted) {
		throw new Error(`axon: ${query || 'the portfolio'} holds ${cards.length} cards of the ${counted} it counts`);
	}
	return { cards, html: first };
}

const nameOf = (card: string) => clean(card.match(NAME)?.[1] ?? '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const { cards, html } = await cardsOf('');
	const options = [...html.matchAll(OPTION)].map(([, value, field, label]) => ({
		value,
		field,
		label: clean(label)
	}));

	// each filter's companies, by name: the tags each option gives them
	const tags = new Map<string, string[]>();
	const past = new Set<string>();
	for (const option of options) {
		// of the statuses, only the companies the fund is past are needed
		if (option.field === STATUS && !PAST.test(option.value)) continue;
		const { cards: listed } = await cardsOf(`${option.field}=${encodeURIComponent(option.value)}`);
		for (const card of listed) {
			const key = nameOf(card).toLowerCase();
			if (option.field === STATUS) past.add(key);
			else tags.set(key, [...(tags.get(key) ?? []), tag(option.label)]);
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = nameOf(card);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...(tags.get(name.toLowerCase()) ?? []), past.has(name.toLowerCase()) ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('axon: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
