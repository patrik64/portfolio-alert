<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Chart from '$lib/charts/Chart.svelte';
	import { dayColumnsConfig, monthColumnsConfig, rankedBarsConfig } from '$lib/charts/configs';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { MonthStatistics, Statistics } from '../../server/statistics';
	import { FUNDS } from '../../shared/funds';

	// held as it arrived rather than made deeply reactive: the numbers are only
	// ever replaced whole, and chart.js cannot instrument an array svelte has
	// wrapped
	let stats = $state.raw<Statistics | null>(null);
	let failed = $state(false);

	// every month comes in the one answer, counted on the server, so stepping
	// from month to month asks for nothing more
	$effect(() => {
		fetch('/statistics.json')
			.then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(String(resp.status)))))
			.then((body: Statistics) => (stats = body))
			.catch(() => (failed = true));
	});

	// the month the address names, or else the latest one with anything in it
	const current = $derived.by(() => {
		if (!stats) return undefined;
		const asked = page.url.searchParams.get('month');
		return (
			stats.months.find((m) => m.month === asked) ??
			stats.months.findLast((m) => m.companies > 0) ??
			stats.months.at(-1)
		);
	});
	const at = $derived(stats && current ? stats.months.indexOf(current) : -1);

	// the month goes into the address, so a link to the page keeps it. the
	// picker changes it in place; a column of the chart at the foot of the page
	// also brings its month's numbers back into view
	function show(month: string, toTop = false) {
		const url = new URL(page.url);
		url.searchParams.set('month', month);
		goto(url, { replaceState: true, keepFocus: true, noScroll: !toTop });
	}

	// the months and days are the server's — those of the nightly job's
	// calendar — so they are written out as given, never moved into the
	// viewer's timezone
	const dateOf = (month: string, day = 1) => new Date(`${month}-${String(day).padStart(2, '0')}T00:00:00Z`);
	const format = (options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' });
	const MONTH_AND_YEAR = format({ month: 'long', year: 'numeric' });
	const MONTH = format({ month: 'short' });
	const WEEKDAY = format({ weekday: 'short' });
	const monthName = (month: string) => MONTH_AND_YEAR.format(dateOf(month));
	const dayName = (month: string, day: number) => `${day} ${MONTH.format(dateOf(month))}`;
	const ordinal = (n: number) =>
		`${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

	const number = (n: number) => n.toLocaleString('en');
	const companies = (n: number) => `${number(n)} ${n === 1 ? 'company' : 'companies'}`;
	const share = (n: number, of: number) => {
		const percent = of > 0 ? (100 * n) / of : 0;
		return percent > 0 && percent < 1 ? 'under 1%' : `${Math.round(percent)}%`;
	};

	// the days of a month that could be counted, first and last: the timeline
	// began partway through its first month, and the latest is still running
	const span = (m: MonthStatistics) => ({
		from: m.days.findIndex((n) => n != null) + 1,
		to: m.days.findLastIndex((n) => n != null) + 1
	});
	const caveat = (m: MonthStatistics) => {
		const { from, to } = span(m);
		if (from > 1) return `counted from the ${ordinal(from)}`;
		if (to < m.days.length) return `so far, to the ${ordinal(to)}`;
		return '';
	};

	const counted = $derived(current ? current.days.filter((n) => n != null) : []);
	const busiest = $derived.by(() => {
		if (!current) return undefined;
		const most = Math.max(0, ...counted);
		return most > 0 ? { day: current.days.indexOf(most) + 1, count: most } : undefined;
	});
	const perDay = $derived.by(() => {
		if (!current || counted.length === 0) return '';
		const average = current.companies / counted.length;
		return average >= 10 ? String(Math.round(average)) : average.toFixed(1);
	});

	interface Row {
		label: string;
		count: number;
		href?: string;
	}
	const fundRows = $derived<Row[]>(
		current?.topFunds.map((f) => ({ label: f.label, count: f.count, href: `/funds/${f.slug}` })) ?? []
	);

	const monthColumns = $derived(
		stats?.months.map((m, i) => {
			const name = MONTH.format(dateOf(m.month));
			const note = caveat(m);
			return {
				// the year under the first month and under every january
				label: i === 0 || m.month.endsWith('-01') ? [name, m.month.slice(0, 4)] : name,
				title: note ? `${monthName(m.month)} — ${note}` : monthName(m.month),
				count: m.companies
			};
		}) ?? []
	);
</script>

<svelte:head>
	<title>statistics — portfolio alert</title>
</svelte:head>

<!-- a ranking as a card: the bars, and under them the same rows as a table -->
{#snippet ranking(
	title: string,
	note: string,
	rows: Row[],
	of: number,
	// what the shares are shares of
	whole: string,
	column: string,
	empty: string
)}
	<section class="rounded-lg bg-white px-4 py-3 shadow-lg">
		<h2 class="font-semibold text-gray-800">{title}</h2>
		<p class="text-xs text-gray-500">{note}</p>
		{#if rows.length === 0}
			<p class="mt-4 mb-2 text-sm text-gray-600">{empty}</p>
		{:else}
			<div class="mt-2">
				<Chart
					label={`bar chart, ${title}: ${rows.map((row) => `${row.label} ${row.count}`).join(', ')}`}
					height={rows.length * 30 + 12}
					config={() => rankedBarsConfig(rows, (row) => `${share(row.count, of)} of ${whole}`)}
				/>
			</div>
			<details class="mt-1">
				<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
				<table class="mt-2 w-full text-sm">
					<thead>
						<tr class="text-xs text-gray-500">
							<th class="pb-1 text-left font-normal">{column}</th>
							<th class="pb-1 text-right font-normal">companies</th>
							<th class="pb-1 pl-3 text-right font-normal">share</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.label)}
							<tr class="border-t border-gray-200">
								<td class="py-1 pr-2 text-gray-800">
									{#if row.href}
										<a href={row.href} class="transition duration-150 hover:underline">{row.label}</a>
									{:else}
										{row.label}
									{/if}
								</td>
								<td class="py-1 text-right text-gray-800 tabular-nums">{number(row.count)}</td>
								<td class="py-1 pl-3 text-right text-gray-500 tabular-nums">{share(row.count, of)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{/if}
	</section>
{/snippet}

{#snippet tile(label: string, value: string, note: string)}
	<div class="rounded-lg bg-white px-4 py-3 shadow-lg">
		<div class="text-xs text-gray-500">{label}</div>
		<div class="mt-0.5 text-2xl font-semibold text-gray-900">{value}</div>
		<div class="text-xs text-gray-500">{note}</div>
	</div>
{/snippet}

<div class="mx-auto mt-2 w-full max-w-[71rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">statistics</h1>
		{#if stats && current}
			<!-- the one filter, above everything it scopes -->
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					aria-label="previous month"
					disabled={at <= 0}
					onclick={() => stats && show(stats.months[at - 1].month)}
					class="h-8 w-8 rounded-md border border-gray-300 bg-white text-gray-800 transition duration-150 hover:bg-gray-200 focus:shadow-outline-gray focus:outline-none disabled:cursor-default disabled:bg-white disabled:text-gray-400"
				>
					‹
				</button>
				<select
					aria-label="month"
					value={current.month}
					onchange={(e) => show(e.currentTarget.value)}
					class="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:shadow-outline-gray focus:outline-none"
				>
					{#each stats.months.toReversed() as m (m.month)}
						<option value={m.month}>{monthName(m.month)}</option>
					{/each}
				</select>
				<button
					type="button"
					aria-label="next month"
					disabled={at >= stats.months.length - 1}
					onclick={() => stats && show(stats.months[at + 1].month)}
					class="h-8 w-8 rounded-md border border-gray-300 bg-white text-gray-800 transition duration-150 hover:bg-gray-200 focus:shadow-outline-gray focus:outline-none disabled:cursor-default disabled:bg-white disabled:text-gray-400"
				>
					›
				</button>
			</div>
		{/if}
	</div>

	{#if failed}
		<p class="mt-6 text-sm text-gray-900">the statistics could not be loaded — try again in a moment</p>
	{:else if !stats || !current}
		<Spinner label="loading statistics" />
	{:else}
		{@const { from, to } = span(current)}
		<p class="mt-1 text-sm text-gray-900">
			the new portfolio companies of {monthName(current.month)}{#if from > 1}, counted from the {ordinal(from)}, the day
				the timeline begins{:else if to < current.days.length}, so far — to the {ordinal(to)}{/if}
		</p>

		<div class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
			{@render tile(
				'new companies',
				number(current.companies),
				perDay ? `${perDay} a day on average` : 'none yet'
			)}
			{@render tile('funds adding', number(current.funds), `of the ${number(FUNDS.length)} tracked`)}
			{@render tile(
				'busiest day',
				busiest ? dayName(current.month, busiest.day) : '—',
				busiest ? companies(busiest.count) : 'none yet'
			)}
			{@render tile(
				'at several funds',
				number(current.shared.length),
				current.shared.length === 1 ? 'company more than one fund added' : 'companies more than one fund added'
			)}
		</div>

		{#if current.companies === 0}
			<p class="mt-6 text-sm text-gray-900">no newcomers in {monthName(current.month)} yet</p>
		{:else}
			<div class="mt-4 grid gap-4 lg:grid-cols-2">
				{@render ranking(
					'most active funds',
					`the funds that added the most companies, of the ${number(current.funds)} that added any`,
					fundRows,
					current.companies,
					"the month's companies",
					'fund',
					''
				)}
				{@render ranking(
					'top categories',
					`sectors only, a category's spellings counted together — ${number(current.categorised)} of ${number(current.companies)} companies carry one`,
					current.topCategories,
					current.categorised,
					'the companies with a category',
					'category',
					'no fund named a category this month'
				)}
			</div>

			<section class="mt-4 rounded-lg bg-white px-4 py-3 shadow-lg">
				<h2 class="font-semibold text-gray-800">new companies by day</h2>
				<p class="text-xs text-gray-500">
					each day's finds, by the night the fetch turned them up{#if from > 1}; shaded, the days before the
						timeline began on the {ordinal(from)}{:else if to < current.days.length}; shaded, the days still to
						come{/if}
				</p>
				<div class="mt-2">
					<Chart
						label={`column chart of the new companies on each day of ${monthName(current.month)}`}
						height={220}
						config={() =>
							dayColumnsConfig(current.days, (i) => {
								const date = dateOf(current.month, i + 1);
								return `${WEEKDAY.format(date)} ${dayName(current.month, i + 1)}`;
							})}
					/>
				</div>
				<details class="mt-1">
					<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
					<table class="mt-2 w-full max-w-xs text-sm">
						<thead>
							<tr class="text-xs text-gray-500">
								<th class="pb-1 text-left font-normal">day</th>
								<th class="pb-1 text-right font-normal">companies</th>
							</tr>
						</thead>
						<tbody>
							{#each current.days as n, i (i)}
								{#if n != null}
									<tr class="border-t border-gray-200">
										<td class="py-1 pr-2 text-gray-800">
											{WEEKDAY.format(dateOf(current.month, i + 1))}
											{dayName(current.month, i + 1)}
										</td>
										<td class="py-1 text-right text-gray-800 tabular-nums">{number(n)}</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<div class="mt-4 grid gap-4 lg:grid-cols-2">
				{@render ranking(
					'stages',
					`the stage a fund came in at, where its page names it — ${number(current.staged)} of ${number(current.companies)} companies`,
					current.stages,
					current.staged,
					'the companies with a stage',
					'stage',
					'no fund named a stage this month'
				)}
				{@render ranking(
					'domain endings',
					`what the address of a company's own site ends in — ${number(current.withSite)} of ${number(current.companies)} companies link one`,
					current.topDomains,
					current.withSite,
					'the companies with a site',
					'ending',
					'no company linked a site of its own this month'
				)}
			</div>

			<section class="mt-4 rounded-lg bg-white px-4 py-3 shadow-lg">
				<h2 class="font-semibold text-gray-800">backed by several funds</h2>
				<p class="text-xs text-gray-500">
					the companies more than one fund added within the month, in the order the funds did
				</p>
				{#if current.shared.length === 0}
					<p class="mt-4 mb-2 text-sm text-gray-600">no company turned up at two funds this month</p>
				{:else}
					<!-- a long list in a long month, so it runs in two columns where there is room -->
					<ul class="mt-2 gap-x-8 lg:columns-2">
						{#each current.shared as company (company.name)}
							<li class="flex break-inside-avoid flex-wrap items-baseline gap-x-3 border-b border-gray-200 py-1.5">
								{#if company.url}
									<a
										href={company.url}
										target="_blank"
										rel="noopener noreferrer"
										class="font-medium text-gray-800 transition duration-150 hover:underline"
									>
										{company.name}
									</a>
								{:else}
									<span class="font-medium text-gray-800">{company.name}</span>
								{/if}
								<span class="text-sm text-gray-600">
									<!-- the comma as an expression: svelte drops the space a bare one ends in -->
									{#each company.funds as fund, i (fund.slug)}{i > 0 ? ', ' : ''}<a
											href={`/funds/${fund.slug}`}
											class="transition duration-150 hover:underline">{fund.name}</a
										>{/each}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<section class="mt-4 rounded-lg bg-white px-4 py-3 shadow-lg">
			<h2 class="font-semibold text-gray-800">month by month</h2>
			<p class="text-xs text-gray-500">
				new companies in each month since the timeline began — a column opens its month
			</p>
			<!-- few months make for few columns, so the chart is only as wide as
			     they need until there are enough to fill the card -->
			<div class="mt-2" style="max-width: {Math.max(240, stats.months.length * 72)}px">
				<Chart
					label={`column chart of the new companies in each month: ${stats.months.map((m) => `${monthName(m.month)} ${m.companies}`).join(', ')}`}
					height={190}
					config={() => monthColumnsConfig(monthColumns, at, (i) => stats && show(stats.months[i].month, true))}
				/>
			</div>
			<details class="mt-1">
				<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
				<table class="mt-2 w-full max-w-md text-sm">
					<thead>
						<tr class="text-xs text-gray-500">
							<th class="pb-1 text-left font-normal">month</th>
							<th class="pb-1 text-right font-normal">companies</th>
							<th class="pb-1 pl-3 text-right font-normal">funds adding</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.months.toReversed() as m (m.month)}
							{@const note = caveat(m)}
							<tr class="border-t border-gray-200">
								<td class="py-1 pr-2 text-gray-800">
									<a
										href={`?month=${m.month}`}
										class="transition duration-150 hover:underline"
										aria-current={m === current ? 'true' : undefined}>{monthName(m.month)}</a
									>
									{#if note}<span class="text-xs text-gray-500">({note})</span>{/if}
								</td>
								<td class="py-1 text-right text-gray-800 tabular-nums">{number(m.companies)}</td>
								<td class="py-1 pl-3 text-right text-gray-800 tabular-nums">{number(m.funds)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		</section>
	{/if}
</div>
