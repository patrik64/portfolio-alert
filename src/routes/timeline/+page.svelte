<script lang="ts">
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { Company } from '../../shared/Company';
	import { FUNDS } from '../../shared/funds';
	import { TIMELINE_START } from '../../shared/timeline';

	let companies = $state<Company[]>([]);
	// each fund's first-ever day: its baseline import, tinted to set those rows
	// apart from genuine newcomers
	let firstDayByFund = $state(new Map<string, string>());
	let loading = $state(true);

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	$effect(() => {
		Promise.all([
			repo(Company).find({
				where: { firstSeenAt: { $gte: TIMELINE_START } },
				orderBy: { name: 'asc' },
				// explicit limit — remult's REST API defaults to 100 rows per page
				limit: 100_000
			}),
			// the first days come from an aggregate over every row, since a
			// fund's baseline import usually predates the timeline
			repo(Company).groupBy({ group: ['fundSlug'], min: ['firstSeenAt'] })
		]).then(([rows, firsts]) => {
			companies = rows;
			firstDayByFund = new Map(
				firsts.flatMap((g) => (g.firstSeenAt.min ? [[g.fundSlug, dayKey(g.firstSeenAt.min)]] : []))
			);
			loading = false;
		});
	});

	const days = $derived.by(() => {
		const byDay = new Map<string, Company[]>();
		for (const c of companies) {
			if (!c.firstSeenAt) continue;
			const key = dayKey(c.firstSeenAt);
			const list = byDay.get(key);
			if (list) list.push(c);
			else byDay.set(key, [c]);
		}
		return [...byDay.entries()]
			.sort((a, b) => (a[0] < b[0] ? 1 : -1))
			.map(([day, rows]) => ({
				day,
				label: new Date(`${day}T00:00:00`).toLocaleDateString(),
				total: rows.length,
				funds: FUNDS.map((f) => ({
					...f,
					companies: rows.filter((c) => c.fundSlug === f.slug)
				})).filter((g) => g.companies.length > 0)
			}));
	});

	// the rss feed links a night as /timeline#YYYY-MM-DD; the days only exist
	// once the rows are in, so the jump happens here rather than on page load
	$effect(() => {
		if (loading || days.length === 0) return;
		document.getElementById(location.hash.slice(1))?.scrollIntoView();
	});
</script>

<svelte:head>
	<title>timeline — portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">timeline</h1>
		{#if !loading && companies.length}
			<span class="text-sm text-gray-600">
				{companies.length.toLocaleString()} companies over {days.length} {days.length === 1 ? 'day' : 'days'}
			</span>
		{/if}
	</div>

	{#if loading}
		<Spinner label="loading timeline" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-gray-600">
			nothing yet — the timeline starts on {TIMELINE_START.toLocaleDateString()}
		</p>
	{:else}
		{#each days as day (day.day)}
			<div id={day.day} class="mt-6 scroll-mt-4">
				<h2 class="font-semibold text-gray-800">
					{day.label}
					<span class="ml-1 text-sm font-normal text-gray-500">
						({day.total} {day.total === 1 ? 'company' : 'companies'})
					</span>
				</h2>
				<div class="mt-3 flex flex-col gap-3">
					{#each day.funds as group (group.slug)}
						{@const baseline = firstDayByFund.get(group.slug) === day.day}
						<details class="rounded-lg bg-white shadow-lg">
							<summary
								class="cursor-pointer px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:text-tertiary-600"
							>
								{group.name}
								<span class="ml-1 text-sm font-normal text-gray-500">({group.companies.length})</span>
								{#if baseline}
									<span class="ml-1 rounded bg-baseline px-1.5 py-0.5 text-xs font-normal text-gray-600">
										baseline import
									</span>
								{/if}
							</summary>
							<ul class="divide-y divide-gray-200 border-t border-gray-200">
								{#each group.companies as company (company.id)}
									<li
										class={`flex items-center justify-between gap-3 px-4 py-2 ${baseline ? 'bg-baseline' : ''}`}
									>
										<div class="min-w-0">
											{#if company.url.startsWith('http')}
												<a
													href={company.url}
													target="_blank"
													rel="noopener noreferrer"
													class="font-medium text-gray-800 transition duration-150 hover:text-tertiary-600"
												>
													{company.name}
												</a>
											{:else}
												<span class="font-medium text-gray-800">{company.name}</span>
											{/if}
											{#if company.category}
												<span class="ml-2 text-xs text-gray-500">{company.category}</span>
											{/if}
										</div>
										<span class="shrink-0 text-xs text-gray-500">
											{company.firstSeenAt?.toLocaleTimeString()}
										</span>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
