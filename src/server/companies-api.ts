// GET /api/v1/companies — the companies the funds' portfolio pages list,
// narrowed the way someone watching the funds asks: what turned up lately
// (a window over the newcomers, the feed's answer), or a fund's whole
// portfolio, by words in the name or the category, exits in or out. A
// company several funds back comes once, with all of them; newest first; as
// json or as a markdown list of links. Read-only and public like the rest
// of the data — the cdn keeps each distinct query for an hour.

import type { RequestEvent } from '@sveltejs/kit';
import { remult, SqlDatabase } from 'remult';
import { api } from './api';
import { SITE_URL } from './rss';
import { fundName } from '../shared/funds';
import { TIMELINE_START } from '../shared/timeline';

export const REPO_URL = 'https://github.com/patrik64/portfolio-alert';

const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const MAX_OFFSET = 100_000;
const MAX_TERMS = 20;
const MAX_TERM_LENGTH = 60;

const SCOPES = ['new', 'all'] as const;
const EXITED_CHOICES = ['any', 'only', 'none'] as const;
const FORMATS = ['json', 'md'] as const;

// every parameter there is, as a line of help — an error hands them all back
const PARAMETERS: Record<string, string> = {
	scope: `${SCOPES.join(' | ')} — new: the companies that appeared on the funds' pages in the window (default); all: every company the funds list, baseline portfolios included — with a fund, name or category to narrow it`,
	days: `the window (scope=new): companies first seen in the last n days, 1–${MAX_DAYS} (default ${DEFAULT_DAYS})`,
	since: `the window from this ISO date or time instead, at most ${MAX_DAYS} days back`,
	name: 'words in the company name, comma-separated, any of them — whole words in any case; a space or hyphen in a word also matches none ("open ai" finds OpenAI and Open-AI); a trailing * matches word beginnings (neuro*)',
	category:
		'words in the category the fund files the company under — its sectors, stage, country, year invested ("Fintech", "Series A", "2026") — matched as in name',
	exclude: 'words that rule a company out, in its name or category, matched as in name',
	fund: 'fund slugs, any of them (the slug of each fund is in /api/funds)',
	exited: `${EXITED_CHOICES.join(' | ')} — only: companies a fund marks as exited (acquired, listed or otherwise out of); none: the ones still held (default any)`,
	limit: `companies a page, 1–${MAX_LIMIT} (default ${DEFAULT_LIMIT})`,
	offset: 'companies to skip — the next page is in the answer',
	format: `${FORMATS.join(' | ')} — md: a markdown list of links grouped by fund (default json)`
};

export class QueryError extends Error {}

interface Term {
	text: string;
	prefix: boolean;
}

export interface CompaniesQuery {
	scope: (typeof SCOPES)[number];
	since: Date | null;
	days: number | null;
	name: Term[];
	category: Term[];
	exclude: Term[];
	fund: string[];
	exited: (typeof EXITED_CHOICES)[number];
	limit: number;
	offset: number;
	format: (typeof FORMATS)[number];
}

// the query string, checked strictly — a misspelt parameter silently
// ignored would answer another question than the one asked
export function parseQuery(params: URLSearchParams, now: Date): CompaniesQuery {
	for (const name of new Set(params.keys()))
		if (!(name in PARAMETERS)) throw new QueryError(`there is no parameter "${name}"`);

	const one = (name: string) => {
		const values = params.getAll(name);
		if (values.length > 1) throw new QueryError(`${name} is given ${values.length} times`);
		return values[0]?.trim() || null;
	};
	const list = (name: string) => [
		...new Set(
			params
				.getAll(name)
				.flatMap((v) => v.split(','))
				.map((v) => v.trim())
				.filter(Boolean)
		)
	];
	const choice = <T extends string>(name: string, options: readonly T[], fallback: T): T => {
		const v = one(name);
		if (v == null) return fallback;
		const value = v.toLowerCase() as T;
		if (!options.includes(value)) throw new QueryError(`${name} must be one of ${options.join(', ')}`);
		return value;
	};
	const whole = (name: string, min: number, max: number) => {
		const v = one(name);
		if (v == null) return null;
		const n = Number(v);
		if (!/^\d+$/.test(v) || n < min || n > max)
			throw new QueryError(`${name} must be a whole number from ${min} to ${max}`);
		return n;
	};
	const terms = (name: string): Term[] => {
		const values = list(name);
		if (values.length > MAX_TERMS) throw new QueryError(`${name} takes ${MAX_TERMS} words at most`);
		return values.map((v) => {
			const prefix = v.endsWith('*');
			const text = (prefix ? v.slice(0, -1) : v).trim();
			if (text.includes('*')) throw new QueryError(`${name} "${v}": a * can only end a word`);
			if (text.length > MAX_TERM_LENGTH)
				throw new QueryError(`${name} "${v}" is longer than ${MAX_TERM_LENGTH} characters`);
			if (!/[\p{L}\p{N}]/u.test(text)) throw new QueryError(`${name} "${v}" has no letters in it`);
			return { text, prefix };
		});
	};

	const scope = choice('scope', SCOPES, 'new');
	const days = whole('days', 1, MAX_DAYS);
	const sinceText = one('since');
	if (days != null && sinceText != null) throw new QueryError('give days or since, not both');
	if (scope === 'all' && (days != null || sinceText != null))
		throw new QueryError('days and since narrow the newcomers; scope=all has no window');
	let since: Date | null = null;
	if (scope === 'new') {
		since = new Date(now.getTime() - (days ?? DEFAULT_DAYS) * 86_400_000);
		if (sinceText != null) {
			since = new Date(sinceText);
			if (Number.isNaN(since.getTime())) throw new QueryError(`since "${sinceText}" is not a date`);
			if (since.getTime() < now.getTime() - MAX_DAYS * 86_400_000)
				throw new QueryError(`since reaches back ${MAX_DAYS} days at most`);
		}
		// the days before the nightly refresh went live were the setup — every
		// fund's baseline import and a week of fetches by hand — and are not
		// newcomers, as for the timeline and the feed
		if (since < TIMELINE_START) since = TIMELINE_START;
	}

	const fund = list('fund').map((v) => v.toLowerCase());
	const unknownFunds = fund.filter((slug) => !fundName.has(slug));
	if (unknownFunds.length)
		throw new QueryError(`no fund has the slug ${unknownFunds.map((s) => `"${s}"`).join(', ')}`);

	const q: CompaniesQuery = {
		scope,
		since,
		days: scope === 'new' && sinceText == null ? (days ?? DEFAULT_DAYS) : null,
		name: terms('name'),
		category: terms('category'),
		exclude: terms('exclude'),
		fund,
		exited: choice('exited', EXITED_CHOICES, 'any'),
		limit: whole('limit', 1, MAX_LIMIT) ?? DEFAULT_LIMIT,
		offset: whole('offset', 0, MAX_OFFSET) ?? 0,
		format: choice('format', FORMATS, 'json')
	};
	// the whole catalogue is tens of thousands of rows; a question about all
	// of it names something to look for
	if (q.scope === 'all' && !q.fund.length && !q.name.length && !q.category.length)
		throw new QueryError('scope=all needs a fund, name or category to narrow it');
	return q;
}

// words as a postgres pattern, matched in any case: each a whole word or,
// with its *, the start of one; a space or hyphen within a word matches
// any run of them, or none
const escapeRegex = (s: string) => s.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
const termsPattern = (terms: Term[]) =>
	`(?:^|[^a-z0-9])(?:${terms
		.map(
			({ text, prefix }) =>
				text.split(/[\s-]+/).filter(Boolean).map(escapeRegex).join('[\\s-]*') +
				(prefix ? '' : '(?:[^a-z0-9]|$)')
		)
		.join('|')})`;

// the Exited tag the scrapers append, a tag of its own among the commas
const EXITED_TAG = '(?:^|,)\\s*Exited\\s*(?:,|$)';

// a column's value among a list — sent as json, since remult's parameters
// pass arrays as json text rather than as postgres arrays
const among = (column: string, values: string[], param: (v: unknown) => string) =>
	`${column} in (select jsonb_array_elements_text(${param(JSON.stringify(values))}::jsonb))`;

// the filters as sql over companies c, cheapest first
function conditions(q: CompaniesQuery, param: (v: unknown) => string): string[] {
	const where: string[] = [];
	if (q.scope === 'new') where.push(`c."isBaseline" = false and c."firstSeenAt" >= ${param(q.since)}`);
	if (q.fund.length) where.push(among('c."fundSlug"', q.fund, param));
	if (q.exited !== 'any') where.push(`${q.exited === 'none' ? 'not ' : ''}(c.category ~ '${EXITED_TAG}')`);
	if (q.name.length) where.push(`c.name ~* ${param(termsPattern(q.name))}`);
	if (q.category.length) where.push(`c.category ~* ${param(termsPattern(q.category))}`);
	if (q.exclude.length) {
		const words = param(termsPattern(q.exclude));
		where.push(`not (c.name ~* ${words} or c.category ~* ${words})`);
	}
	return where;
}

// a company as the query returns it: its earliest listing, and every fund
// listing it
interface ListingRow {
	fundSlug: string;
	name: string;
	category: string;
	url: string;
	firstSeenAt: string;
}
interface CompanyRow {
	name: string;
	firstSeenAt: string;
	listings: ListingRow[];
}

export async function findCompanies(
	db: SqlDatabase,
	q: CompaniesQuery
): Promise<{ total: number; companies: CompanyRow[] }> {
	const command = db.createCommand();
	const param = (v: unknown) => command.param(v);
	const where = conditions(q, param);
	// a company is its name, in any case and spacing, across the funds
	// backing it — the same identity the site counts companies by
	const { rows } = await command.execute(`
		with hits as (
			select c."fundSlug", c.name, c.category, c.url, c."firstSeenAt",
				lower(regexp_replace(trim(c.name), '\\s+', ' ', 'g')) as key
			from companies c
			where ${where.length ? where.join(' and ') : 'true'}
		),
		grouped as (
			select key,
				(array_agg(name order by "firstSeenAt", "fundSlug"))[1] as name,
				min("firstSeenAt") as "firstSeenAt",
				json_agg(json_build_object(
					'fundSlug', "fundSlug", 'name', name, 'category', category, 'url', url,
					'firstSeenAt', "firstSeenAt"
				) order by "firstSeenAt", "fundSlug") as listings
			from hits
			group by key
		)
		select
			(select count(*) from grouped)::int as total,
			coalesce(
				(select json_agg(g order by g."firstSeenAt" desc, g.name)
				 from (
					select * from grouped
					order by "firstSeenAt" desc, name
					limit ${param(q.limit)} offset ${param(q.offset)}
				 ) g),
				'[]'::json
			) as companies`);
	return { total: Number(rows[0].total), companies: rows[0].companies as CompanyRow[] };
}

// a company as the api hands it out
interface ApiCompany {
	name: string;
	// the company's site as the first fund to list it gives it, else the
	// first any fund gives; a fund without one links the company's page
	// on its own site, or nothing
	url: string;
	// a fund's category is what its page files the company under — sectors,
	// stage, country, the year it came in — with "Exited" for one it is out of
	funds: { slug: string; name: string; category: string; tags: string[]; url: string; firstSeenAt: string }[];
	exited: boolean;
	firstSeenAt: string;
}

const tagsOf = (category: string) =>
	category
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);

const toApiCompany = (row: CompanyRow): ApiCompany => ({
	name: row.name,
	url: row.listings.find((l) => l.url)?.url ?? '',
	funds: row.listings.map((l) => ({
		slug: l.fundSlug,
		name: fundName.get(l.fundSlug) ?? l.fundSlug,
		category: l.category,
		tags: tagsOf(l.category),
		url: l.url,
		firstSeenAt: new Date(l.firstSeenAt).toISOString()
	})),
	exited: row.listings.some((l) => tagsOf(l.category).includes('Exited')),
	firstSeenAt: new Date(row.firstSeenAt).toISOString()
});

const termText = ({ text, prefix }: Term) => (prefix ? `${text}*` : text);

// the query as it was understood, defaults included
const echo = (q: CompaniesQuery) => ({
	scope: q.scope,
	days: q.days,
	since: q.since?.toISOString() ?? null,
	name: q.name.map(termText),
	category: q.category.map(termText),
	exclude: q.exclude.map(termText),
	fund: q.fund,
	exited: q.exited,
	limit: q.limit,
	offset: q.offset,
	format: q.format
});

// the markdown list: a heading saying what was asked, then the companies
// grouped by the fund that listed each first, in the order they came
const escapeMarkdown = (s: string) => s.replace(/[\\`*_[\]<>]/g, '\\$&');
const escapeLink = (url: string) => url.replace(/[()<>\s]/g, (c) => encodeURIComponent(c));
const day = (iso: string) => iso.slice(0, 10);

function markdown(q: CompaniesQuery, now: Date, total: number, companies: ApiCompany[], next: string | null) {
	const asked = [
		q.fund.length ? `fund: ${q.fund.map((s) => fundName.get(s) ?? s).join(', ')}` : '',
		q.name.length ? `name: ${q.name.map(termText).join(', ')}` : '',
		q.category.length ? `category: ${q.category.map(termText).join(', ')}` : '',
		q.exclude.length ? `excluding: ${q.exclude.map(termText).join(', ')}` : '',
		q.exited === 'only' ? 'exited' : q.exited === 'none' ? 'still held' : ''
	].filter(Boolean);
	const what = total === 1 ? 'company' : 'companies';
	const lines = [
		q.since
			? `# ${total} ${what} first seen ${day(q.since.toISOString())} – ${day(now.toISOString())}`
			: `# ${total} ${what} listed`,
		'',
		...(asked.length ? [`${asked.join(' · ')}`, ''] : [])
	];
	if (companies.length === 0) lines.push(q.offset > 0 ? 'No more companies.' : 'No company matched.');
	else {
		lines.push(
			`Newest first, ${q.offset + 1}–${q.offset + companies.length} of ${total}. Collected by portfolio alert, ${SITE_URL}`
		);
		const byFund = new Map<string, ApiCompany[]>();
		for (const company of companies) {
			const fund = company.funds[0].name;
			const list = byFund.get(fund);
			if (list) list.push(company);
			else byFund.set(fund, [company]);
		}
		for (const [fund, list] of byFund) {
			lines.push('', `## ${escapeMarkdown(fund)}`);
			for (const company of list) {
				const details = [
					company.funds[0].category,
					day(company.firstSeenAt),
					company.funds.length > 1
						? `also ${company.funds
								.slice(1)
								.map((f) => f.name)
								.join(', ')}`
						: ''
				].filter(Boolean);
				const title = escapeMarkdown(company.name);
				lines.push(
					`- ${company.url ? `[${title}](${escapeLink(company.url)})` : title} — ${escapeMarkdown(details.join(' · '))}`
				);
			}
		}
	}
	if (next) lines.push('', `${total - q.offset - companies.length} more: ${next}`);
	return lines.join('\n') + '\n';
}

// the answers change once a night, when the funds are refreshed; the cdn
// holds each distinct query for an hour and serves it a while longer while
// fetching a fresh one (a deploy clears the cache)
const HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...(status === 200 ? HEADERS : {}) }
	});

export async function companiesApiResponse(event: RequestEvent): Promise<Response> {
	const now = new Date();
	let q: CompaniesQuery;
	try {
		q = parseQuery(event.url.searchParams, now);
	} catch (err) {
		if (!(err instanceof QueryError)) throw err;
		return json({ error: err.message, parameters: PARAMETERS, docs: `${REPO_URL}#api` }, 400);
	}
	return api.withRemult(event, async () => {
		const db = remult.dataProvider;
		if (!(db instanceof SqlDatabase))
			return json(
				{ error: 'the companies api runs its queries in postgres; the json files of local development have none' },
				501
			);
		const found = await findCompanies(db, q);
		const companies = found.companies.map(toApiCompany);
		let next: string | null = null;
		if (q.offset + companies.length < found.total) {
			const url = new URL(event.url);
			url.searchParams.set('offset', String(q.offset + q.limit));
			next = url.toString();
		}
		if (q.format === 'md')
			return new Response(markdown(q, now, found.total, companies, next), {
				// plain text, which every browser shows rather than downloads
				headers: { 'Content-Type': 'text/plain; charset=utf-8', ...HEADERS }
			});
		return json({
			query: echo(q),
			window: q.since ? { from: q.since.toISOString(), to: now.toISOString() } : null,
			total: found.total,
			count: companies.length,
			next,
			companies
		});
	});
}
