import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.firstminute.capital';
// the stories the portfolio page draws, published as a static file at build
// time and read by the page itself from this address (see its chunks)
const STORIES_URL = `${BASE_URL}/_api/portfolio.json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over storyblok: the portfolio page arrives empty and fills itself
// from a json file of the portfolio stories the build wrote beside it, one
// story per company with its sectors, its type ("Enterprise" or
// "Consumer"), where it works from and its website. a company the fund is
// out of says so in its name — "Dadi (Acquired)" — which is not part of it;
// its milestones can say to whom ("2022: Acquired by Ro for $100m"), and
// that is kept when they do. the stories' dates are the entries' own, not
// the investments', and are left alone.

interface Story {
	name?: string;
	content?: {
		sector?: string[];
		type?: string;
		location?: string[];
		locations?: string;
		link?: { label?: string; link?: { url?: string; cached_url?: string } }[];
		milestones?: { heading?: string }[];
	};
}

const ACQUIRED = /\s*\((acquired|exited|ipo)\)\s*$/i;
const BUYER = /^\s*(?:\d{4}\s*:\s*)?(acquired by [^,.(]+?)(?:\s+for\b.*)?\s*$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "London, UK" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(STORIES_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${STORIES_URL}: ${resp.status}`);
	}
	const stories = (await resp.json()) as Story[];
	if (!Array.isArray(stories)) {
		throw new Error('firstminute: the portfolio file is not a list of stories');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const story of stories) {
		const listed = clean(story.name ?? '');
		const exit = listed.match(ACQUIRED)?.[1] ?? '';
		const name = listed.replace(ACQUIRED, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const content = story.content ?? {};
		const website =
			(content.link ?? []).find((l) => /^website$/i.test(l.label ?? '') && l.link?.url)?.link?.url ??
			(content.link ?? []).find((l) => l.link?.url)?.link?.url ??
			'';
		const buyer = (content.milestones ?? [])
			.map((m) => clean(m.heading ?? '').match(BUYER)?.[1] ?? '')
			.find(Boolean);
		const outcome = exit ? buyer || (exit.toUpperCase() === 'IPO' ? 'IPO' : 'Acquired') : '';
		companies.push({
			name,
			category: [
				...(content.sector ?? []).map(tag),
				tag(content.type ?? ''),
				tag(content.locations ?? ''),
				outcome ? tag(outcome).replace(/^acquired by/i, 'Acquired by') : '',
				exit ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			// a site typed without its scheme ("corvera.ai") is given one
			url: unescape(website).trim().replace(/^(?=[\w-]+(\.[\w-]+)+)/, 'https://')
		});
	}

	if (companies.length === 0) {
		throw new Error('firstminute: the portfolio file lists no companies');
	}

	return companies;
}
