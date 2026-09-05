import type { ScrapedCompany } from './types';

const BASE_URL = 'https://omnivore.vc';
const FEED_URL = `${BASE_URL}/api/portfolio-page?populate=deep`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app over strapi: /portfolio is an empty shell and the page is built
// in the browser from the fund's own cms, so the portfolio is asked for the
// way the app asks for it. the whole page comes back in one call — the
// companies are a list on it rather than a collection of their own, so there
// is no paging to walk.
//
// the fund publishes a company's own site and its linkedin. two companies have
// no site of their own written down and keep the linkedin the fund gives them,
// since it publishes no page of its own for a company to fall back on.
//
// it marks an exit twice over and the two disagree: a flag on the company, set
// on all three, and an Exited among the tags, put on two of them. both are
// read, so neither has to be the right one. it also records who bought the
// company — Sumitomo, Nutreco, Mahindra — but an acquirer's name on its own
// reads as a tag about the wrong company, so it is left out.

interface Named {
	attributes?: { title?: string };
}

interface Company {
	name?: string;
	website?: string | null;
	linkedin?: string | null;
	exited?: boolean | null;
	categories?: { data?: Named[] };
}

interface Feed {
	data?: { attributes?: { companies?: Company[] } };
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// the fund types some of its tags with two spaces in them — Emerging
// Technologies, Inclusive  Fintech — which the collapse takes out
const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the tag the fund puts on a company it has exited, taken out of the list it
// sits in so that the exit reads last on every company that has one, however
// the fund happened to mark it
const EXITED = /^exited$/i;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(FEED_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${FEED_URL}: ${resp.status}`);
	}

	let feed: Feed;
	try {
		feed = (await resp.json()) as Feed;
	} catch {
		throw new Error('omnivore: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of feed.data?.attributes?.companies ?? []) {
		const name = clean(company.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const tags = (company.categories?.data ?? [])
			.map((c) => tag(c.attributes?.title ?? ''))
			.filter(Boolean);
		const exited = company.exited === true || tags.some((t) => EXITED.test(t));

		companies.push({
			name,
			category: [...new Set(tags.filter((t) => !EXITED.test(t))), exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(company.website ?? '') || clean(company.linkedin ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('omnivore: no companies in the portfolio');
	}

	return companies;
}
