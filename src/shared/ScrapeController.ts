import { BackendMethod, repo, SqlDatabase } from 'remult';
import type { ScrapedCompany } from '../server/scrapers/types';
import { Company } from './Company';
import { Fund } from './Fund';

export interface FetchResult {
	slug: string;
	total: number;
	added: number;
	// the first fetch of a fund imports a baseline: nothing is marked as new
	baseline: boolean;
}

// a search result row; firstSeenAt travels as an ISO string over the wire
export interface SearchHit {
	id: string;
	fundSlug: string;
	name: string;
	category: string;
	url: string;
	firstSeenAt: string;
}

export const SEARCH_LIMIT = 500;

// one operand of a search term: what to look for, and whether it must match a
// field exactly (it was written in quotes) or merely appear in one
interface SearchPart {
	needle: string;
	exact: boolean;
}

// a term parses into an OR of AND-groups: an uppercase OR starts a new group,
// an uppercase AND separates operands within one — so AND binds tighter — and
// a quoted stretch is one operand whatever it says inside. lowercase and/or
// are ordinary text, as is an apostrophe inside a word ("women's health");
// only a '…' standing free the way a "…" does quotes
const parseSearch = (term: string): SearchPart[][] => {
	const groups: SearchPart[][] = [];
	let group: SearchPart[] = [];
	let buf = '';
	const endPart = () => {
		const q = buf.trim();
		buf = '';
		const quoted = q.match(/^"([\s\S]+)"$/) ?? q.match(/^'([\s\S]+)'$/);
		const needle = (quoted?.[1] ?? q).trim();
		if (needle) group.push({ needle, exact: !!quoted });
	};
	const endGroup = () => {
		endPart();
		if (group.length) groups.push(group);
		group = [];
	};
	for (const token of term.match(/"[^"]*"|(?<=^|\s)'[^']*'(?=\s|$)|\s+|[^\s"]+|"/g) ?? []) {
		if (token === 'OR') endGroup();
		else if (token === 'AND') endPart();
		else buf += token;
	}
	endGroup();
	return groups;
};

// whether one company satisfies one operand, the way the comment on
// searchCompanies spells out
const partMatches = (company: Company, part: SearchPart): boolean => {
	const key = part.needle.toLowerCase();
	if (!part.exact)
		return (
			company.name.toLowerCase().includes(key) || company.category.toLowerCase().includes(key)
		);
	return (
		company.name.trim().toLowerCase() === key ||
		company.category
			.toLowerCase()
			.split(',')
			.some((tag) => tag.trim() === key)
	);
};

// scraped text often carries HTML entities ("Abbot&#8217;s", "AI &amp; ML");
// decode once here so every fund gets clean names and categories
const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“'
};

const decodeEntities = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
		.replace(/[​‌‍﻿]/g, '')
		.trim();

// company identity within a fund — urls and categories are too unreliable to key on
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const inFlight = new Set<string>();

// the sql database when one is connected; undefined on the json fallback
// store (dev without DATABASE_URL), where callers filter in memory instead
function sqlDb(): SqlDatabase | undefined {
	try {
		return SqlDatabase.getDb();
	} catch {
		return undefined;
	}
}

export class ScrapeController {
	@BackendMethod({ allowed: true })
	static async fetchFund(slug: string): Promise<FetchResult> {
		// This class is client-bundled (it's how @BackendMethod builds its HTTP
		// proxy), but the method body only ever runs on the server. The statically
		// dead !SSR branch lets Vite drop the scrapers from the client build.
		if (!import.meta.env.SSR) throw new Error('fetchFund only runs on the server');
		const { scraperBySlug } = await import('../server/scrapers/index');
		const entry = scraperBySlug.get(slug);
		if (!entry) throw new Error(`unknown fund: ${slug}`);
		if (inFlight.has(slug)) throw new Error(`${entry.name}: fetch already running`);
		inFlight.add(slug);
		try {
			const scraped = await Promise.race([
				entry.scrape(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`${entry.name}: scrape timed out after 4 minutes`)),
						240_000
					)
				)
			]);

			const byKey = new Map<string, ScrapedCompany>();
			for (const c of scraped) {
				const name = decodeEntities(c.name ?? '');
				const key = nameKey(name);
				if (key && !byKey.has(key)) byKey.set(key, { ...c, name });
			}

			const companies = repo(Company);
			const existing = await companies.find({ where: { fundSlug: slug }, limit: 100_000 });
			const existingKeys = new Set(existing.map((c) => nameKey(c.name)));
			const newcomers = [...byKey].filter(([key]) => !existingKeys.has(key));
			const baseline = existing.length === 0;

			// the previous batch is no longer "new" — cleared only now that the
			// scrape succeeded, so a failed fetch keeps the last newcomer set intact
			await companies.updateMany({
				where: { fundSlug: slug, isNewcomer: true },
				set: { isNewcomer: false }
			});

			// chunked concurrent inserts; the pg pool bounds real concurrency
			for (let i = 0; i < newcomers.length; i += 50) {
				await Promise.all(
					newcomers.slice(i, i + 50).map(([key, c]) =>
						companies.insert({
							id: `${slug}:${key}`,
							fundSlug: slug,
							name: c.name.trim(),
							category: decodeEntities(c.category ?? ''),
							url: (c.url ?? '').replace(/&amp;/g, '&'),
							isNewcomer: !baseline,
							isBaseline: baseline
						})
					)
				);
			}

			const added = baseline ? 0 : newcomers.length;
			await repo(Fund).upsert({
				where: { slug },
				set: {
					name: entry.name,
					companyCount: existing.length + newcomers.length,
					newCount: added,
					lastFetchedAt: new Date(),
					lastError: ''
				}
			});
			return { slug, total: existing.length + newcomers.length, added, baseline };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await repo(Fund)
				.upsert({ where: { slug }, set: { lastError: message } })
				.catch(() => {});
			throw err;
		} finally {
			inFlight.delete(slug);
		}
	}

	// a term is an OR of AND-groups (see parseSearch). An operand matches a
	// company when its name or category contains it — or, written in quotes,
	// when the name is exactly that, or a category tag is — all
	// case-insensitively. exactness is decided here rather than in the
	// browser, because the rows a substring query returns are capped and the
	// exact ones must not be lost behind that cap. offset (a multiple of
	// SEARCH_LIMIT) fetches the pages behind the "show more" link; the id
	// tiebreak keeps them from shuffling
	@BackendMethod({ allowed: true })
	static async searchCompanies(term: string, offset = 0): Promise<SearchHit[]> {
		const groups = parseSearch(term);
		if (groups.length === 0) return [];
		const page = Math.floor(offset / SEARCH_LIMIT) + 1;

		// the store narrows by substrings — an exact match is one of those
		// too — and any exact operands are then judged here on the capped rows
		const anyContains = (needle: string) => ({
			$or: [{ name: { $contains: needle } }, { category: { $contains: needle } }]
		});
		const hasExact = groups.some((g) => g.some((p) => p.exact));
		const rows = await repo(Company).find({
			where: { $or: groups.map((g) => ({ $and: g.map((p) => anyContains(p.needle)) })) },
			orderBy: { name: 'asc', id: 'asc' },
			limit: hasExact ? 100_000 : SEARCH_LIMIT,
			// with an exact operand the filtering happens below, after the
			// fetch — it pages there too
			...(hasExact ? {} : { page })
		});

		const hits = hasExact
			? rows
					.filter((company) => groups.some((g) => g.every((p) => partMatches(company, p))))
					.slice(offset, offset + SEARCH_LIMIT)
			: rows;

		return hits.map((company) => ({
			id: company.id,
			fundSlug: company.fundSlug,
			name: company.name,
			category: company.category,
			url: company.url,
			firstSeenAt: company.firstSeenAt?.toISOString() ?? ''
		}));
	}

	// the same company may be backed by several funds, so it is counted once:
	// by the address it lives at, or by its name (case-insensitively) when no
	// address is published. the counting happens in the database — shipping
	// every row over the wire just to count it was the site's single biggest
	// data-transfer cost
	@BackendMethod({ allowed: true })
	static async countCompanies(): Promise<number> {
		const db = sqlDb();
		if (db) {
			const result = await db.execute(
				`select count(distinct url) filter (where url <> '')
				     + count(distinct lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))) filter (where url = '') as n
				  from companies`
			);
			return Number(result.rows[0].n);
		}
		const rows = await repo(Company).find({ limit: 100_000 });
		const urls = new Set<string>();
		const names = new Set<string>();
		for (const company of rows) {
			if (company.url) urls.add(company.url);
			else names.add(nameKey(company.name));
		}
		return urls.size + names.size;
	}

	// "clean" on the newcomers page: acknowledge the current newcomers so the
	// list starts empty until the next fetch finds something new
	@BackendMethod({ allowed: true })
	static async clearNewcomers(): Promise<number> {
		const cleared = await repo(Company).updateMany({
			where: { isNewcomer: true },
			set: { isNewcomer: false }
		});
		await repo(Fund).updateMany({ where: { newCount: { $gt: 0 } }, set: { newCount: 0 } });
		return cleared;
	}
}
