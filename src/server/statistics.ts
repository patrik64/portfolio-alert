// The numbers behind the statistics page: each month's newcomers counted by
// fund, by category, by stage, by the ending of their site's address and by
// day, with the companies more than one fund added. The newcomers are the
// feed's — nothing a fund's baseline import brought in, nothing from before
// the nightly refresh went live — and the months and days are those of the
// timezone the nightly job keeps (see rss.ts), so a night's finds stay
// together.

import { fundBySlug, fundName } from '../shared/funds';
import { TIMELINE_START } from '../shared/timeline';
import { dayKey } from './rss';
import { readTags } from './tags';

// how many bars a ranking shows
const TOP = 10;
const MAX_SHARED = 100;

export interface Tally {
	label: string;
	count: number;
}

export interface FundTally extends Tally {
	slug: string;
}

export interface SharedCompany {
	name: string;
	// its own site, where one of the funds links it
	url: string;
	// the funds that added it, in the order they did
	funds: { slug: string; name: string }[];
}

export interface MonthStatistics {
	// YYYY-MM
	month: string;
	// the companies each day of the month brought; null for a day that could
	// bring none — before the timeline began, or still to come
	days: (number | null)[];
	// every listing: a company two funds added counts twice, as it does on the
	// timeline and in the feed
	companies: number;
	// the funds that added any, and those that added the most
	funds: number;
	topFunds: FundTally[];
	// the companies filed under at least one category, and the categories most
	// of them are under
	categorised: number;
	topCategories: Tally[];
	// the same for the stage the fund came in at, which few funds name
	staged: number;
	stages: Tally[];
	// the companies with a site of their own, and what its address ends in
	withSite: number;
	topDomains: Tally[];
	// the companies more than one fund added within the month
	shared: SharedCompany[];
}

export interface Statistics {
	// every month since the timeline began, oldest first
	months: MonthStatistics[];
}

export interface NewcomerRow {
	fundSlug: string;
	name: string;
	category: string;
	url: string;
	firstSeenAt: Date;
}

// a company is its name, in any case and spacing, across the funds backing
// it — the same identity the site counts companies by
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// a profile on someone else's site is not a site of the company's own
const NOT_A_SITE =
	/(?:^|\.)(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com|github\.com|medium\.com|substack\.com|notion\.site|linktr\.ee|apple\.com|google\.com)$/;

// the host of a company's own site — nothing where the fund, having none to
// link, links the company's page on the fund's own
function siteHost(row: NewcomerRow): string {
	if (!/^https?:\/\//i.test(row.url)) return '';
	const host = hostOf(row.url);
	const fund = hostOf(fundBySlug.get(row.fundSlug)?.url ?? '');
	if (!host || NOT_A_SITE.test(host)) return '';
	if (fund && (host === fund || host.endsWith(`.${fund}`))) return '';
	return host;
}

const count = (tally: Map<string, number>, key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);

// the largest first, and a tie by name, so that the order never shuffles
const ranked = <T extends Tally>(tallies: T[], limit = TOP) =>
	tallies.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);

interface Bucket {
	month: string;
	days: (number | null)[];
	rows: NewcomerRow[];
}

export function statistics(rows: NewcomerRow[], now = new Date()): Statistics {
	const start = dayKey(TIMELINE_START);
	const today = dayKey(now);

	// every month from the first to the running one, a quiet one included
	const buckets = new Map<string, Bucket>();
	for (let [year, month] = start.split('-').map(Number); ; month === 12 ? (year++, (month = 1)) : month++) {
		const key = `${year}-${String(month).padStart(2, '0')}`;
		if (key > today.slice(0, 7)) break;
		const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
		buckets.set(key, {
			month: key,
			days: Array.from({ length }, (_, i) => {
				const day = `${key}-${String(i + 1).padStart(2, '0')}`;
				return day >= start && day <= today ? 0 : null;
			}),
			rows: []
		});
	}

	// how each category is written, across all the months, so that it is shown
	// the same way in each: of the spellings sharing a key, the one most funds
	// use — one fund with many companies does not get to decide it
	const spellings = new Map<string, Map<string, Set<string>>>();
	const tagged = new Map<NewcomerRow, ReturnType<typeof readTags>>();
	for (const row of rows) {
		const day = dayKey(row.firstSeenAt);
		const bucket = buckets.get(day.slice(0, 7));
		if (!bucket || day < start) continue;
		const at = Number(day.slice(8)) - 1;
		bucket.days[at] = (bucket.days[at] ?? 0) + 1;
		bucket.rows.push(row);

		const tags = readTags(row.category);
		tagged.set(row, tags);
		for (const [key, label] of tags.categories) {
			if (!spellings.has(key)) spellings.set(key, new Map());
			const written = spellings.get(key)!;
			if (!written.has(label)) written.set(label, new Set());
			written.get(label)!.add(row.fundSlug);
		}
	}
	const categoryName = (key: string) =>
		ranked(
			[...spellings.get(key)!].map(([label, funds]) => ({ label, count: funds.size })),
			1
		)[0].label;

	return {
		months: [...buckets.values()].map(({ month, days, rows }) => {
			const funds = new Map<string, number>();
			const categories = new Map<string, number>();
			const stages = new Map<string, number>();
			const domains = new Map<string, number>();
			const byName = new Map<string, NewcomerRow[]>();
			let categorised = 0;
			let staged = 0;
			let withSite = 0;

			for (const row of rows) {
				count(funds, row.fundSlug);

				const tags = tagged.get(row)!;
				if (tags.categories.size) categorised++;
				for (const key of tags.categories.keys()) count(categories, key);
				if (tags.stages.size) staged++;
				for (const stage of tags.stages) count(stages, stage);

				const host = siteHost(row);
				if (host) {
					withSite++;
					count(domains, `.${host.split('.').pop()}`);
				}

				const key = nameKey(row.name);
				if (!byName.has(key)) byName.set(key, []);
				byName.get(key)!.push(row);
			}

			const shared: SharedCompany[] = [];
			for (const listings of byName.values()) {
				if (new Set(listings.map((l) => l.fundSlug)).size < 2) continue;
				listings.sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
				const slugs = [...new Set(listings.map((l) => l.fundSlug))];
				const site = listings.find((l) => siteHost(l));
				shared.push({
					name: listings[0].name,
					url: site?.url ?? '',
					funds: slugs.map((slug) => ({ slug, name: fundName.get(slug) ?? slug }))
				});
			}
			shared.sort((a, b) => b.funds.length - a.funds.length || a.name.localeCompare(b.name));

			const tallies = (tally: Map<string, number>) => [...tally].map(([label, n]) => ({ label, count: n }));
			return {
				month,
				days,
				companies: rows.length,
				funds: funds.size,
				topFunds: ranked([...funds].map(([slug, n]) => ({ slug, label: fundName.get(slug) ?? slug, count: n }))),
				categorised,
				topCategories: ranked([...categories].map(([key, n]) => ({ label: categoryName(key), count: n }))),
				staged,
				stages: ranked(tallies(stages)),
				withSite,
				topDomains: ranked(tallies(domains)),
				shared: shared.slice(0, MAX_SHARED)
			};
		})
	};
}
