import type { ScrapedCompany } from './types';

const BASE_URL = 'https://harlem.capital';
const GRAPHQL_URL = `${BASE_URL}/graphql`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on wp engine, the portfolio page an empty shell that a react app
// fills from the site's graphql endpoint: the theme's settings hold the
// companies the page shows, each with its site and the fund's categories for
// it. "Spotlight" among those marks the ones the fund features and is left
// off, as the page leaves it off; "Exited" is kept, as the tag. a company
// without a site of its own (govpredict) links to its page on the fund's site.

const QUERY = `{
	themeSettings {
		global {
			portfolioColumns {
				items {
					... on Profile {
						title
						link
						portfolio { website { url } }
						portfolioCategories { nodes { name } }
					}
				}
			}
		}
	}
}`;

const STEALTH = /^stealth\b/i;

interface Profile {
	title?: string | null;
	link?: string | null;
	portfolio?: { website?: { url?: string | null } | null } | null;
	portfolioCategories?: { nodes?: { name?: string | null }[] | null } | null;
}

interface Result {
	data?: {
		themeSettings?: {
			global?: { portfolioColumns?: { items?: Profile[] | null }[] | null } | null;
		} | null;
	} | null;
	errors?: { message?: string }[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(`${GRAPHQL_URL}?query=${encodeURIComponent(QUERY)}`, {
		headers: { 'User-Agent': UA }
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${GRAPHQL_URL}: ${resp.status}`);
	}
	const result = (await resp.json()) as Result;
	if (result.errors?.length) {
		throw new Error(`harlem: graphql says ${result.errors.map((e) => e.message).join('; ')}`);
	}
	const columns = result.data?.themeSettings?.global?.portfolioColumns ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const profile of columns.flatMap((column) => column.items ?? [])) {
		const name = clean(profile.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = (profile.portfolioCategories?.nodes ?? []).map((node) => tag(node.name ?? ''));
		const exited = labels.some((label) => /^exited$/i.test(label));
		companies.push({
			name,
			category: [
				...labels.filter((label) => !/^(spotlight|exited)$/i.test(label)),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: profile.portfolio?.website?.url?.trim() || profile.link || ''
		});
	}

	if (companies.length === 0) {
		throw new Error('harlem: the portfolio settings list no companies');
	}

	return companies;
}
