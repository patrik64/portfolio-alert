<script lang="ts">
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { Company } from '../../shared/Company';
	import { FUNDS } from '../../shared/funds';

	let companies = $state<Company[]>([]);
	let baselineRows = $state<Company[]>([]);
	let loading = $state(true);
	let loadingBaseline = $state(false);
	let includeBaseline = $state(false);
	let baselineLoaded = false;

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	$effect(() => {
		repo(Company)
			.find({
				where: { isBaseline: false },
				orderBy: { name: 'asc' },
				// explicit limit — remult's REST API defaults to 100 rows per page
				limit: 100_000
			})
			.then((rows) => {
				companies = rows;
				loading = false;
			});
	});

	// the ~50k baseline rows are only fetched the first time the box is ticked;
	// unticking just filters them back out locally
	$effect(() => {
		if (!includeBaseline || baselineLoaded) return;
		baselineLoaded = true;
		loadingBaseline = true;
		repo(Company)
			.find({ where: { isBaseline: true }, orderBy: { name: 'asc' }, limit: 100_000 })
			.then((rows) => {
				baselineRows = rows;
				loadingBaseline = false;
			});
	});

	const days = $derived.by(() => {
		const byDay = new Map<string, Company[]>();
		for (const c of includeBaseline ? [...companies, ...baselineRows] : companies) {
			if (!c.firstSeenAt) continue;
			const key = dayKey(c.firstSeenAt);
			const list = byDay.get(key);
			if (list) list.push(c);
			else byDay.set(key, [c]);
		}
		return [...byDay.entries()]
			.sort((a, b) => (a[0] < b[0] ? 1 : -1))
			.map(([day, rows]) => {
				const funds = FUNDS.map((f) => ({
					...f,
					// both sources arrive name-sorted, so merged groups re-sort
					companies: rows.filter((c) => c.fundSlug === f.slug).sort((a, b) => a.name.localeCompare(b.name))
				})).filter((g) => g.companies.length > 0);
				return {
					day,
					label: new Date(`${day}T00:00:00`).toLocaleDateString(),
					total: rows.length,
					funds
				};
			});
	});

	const shownCount = $derived(days.reduce((n, d) => n + d.total, 0));

	// the rss feed links a night as /timeline#YYYY-MM-DD; the days only exist
	// once the rows are in, so the jump happens here rather than on page load
	// (once only — toggling the baseline checkbox must not re-scroll)
	let jumped = false;
	$effect(() => {
		if (jumped || loading || days.length === 0) return;
		jumped = true;
		document.getElementById(location.hash.slice(1))?.scrollIntoView();
	});
</script>

<svelte:head>
	<title>timeline — portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">timeline</h1>
		{#if !loading}
			<div class="flex flex-wrap items-center gap-4">
				<label class="flex cursor-pointer items-center gap-1.5 text-sm text-white select-none">
					<input
						type="checkbox"
						bind:checked={includeBaseline}
						class="form-checkbox h-4 w-4 cursor-pointer text-gray-800 transition duration-150 focus:shadow-outline-gray focus:outline-none"
					/>
					include baseline imports
				</label>
				{#if shownCount}
					<span class="text-sm text-white">
						{shownCount.toLocaleString()} companies over {days.length} {days.length === 1 ? 'day' : 'days'}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if loading || loadingBaseline}
		<Spinner label="loading timeline" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-white">
			{#if !includeBaseline}
				no newcomers yet — tick the box above to include the baseline imports
			{:else}
				nothing yet — run a fetch from the dashboard
			{/if}
		</p>
	{:else}
		{#each days as day (day.day)}
			<div id={day.day} class="mt-6 scroll-mt-4">
				<h2 class="font-semibold text-white">
					{day.label}
					<span class="ml-1 text-sm font-normal text-white">
						({day.total} {day.total === 1 ? 'company' : 'companies'})
					</span>
				</h2>
				<div class="mt-3 flex flex-col gap-3">
					{#each day.funds as group (group.slug)}
						{@const baseline = group.companies.some((c) => c.isBaseline)}
						<details class="rounded-lg bg-white shadow-lg">
							<summary
								class="cursor-pointer px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:underline"
							>
								{group.name}
								<span class="ml-1 text-sm font-normal text-gray-900">({group.companies.length})</span>
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
													class="font-medium text-gray-800 transition duration-150 hover:underline"
												>
													{company.name}
												</a>
											{:else}
												<span class="font-medium text-gray-800">{company.name}</span>
											{/if}
											{#if company.category}
												<span class="ml-2 text-xs text-gray-900">{company.category}</span>
											{/if}
										</div>
										<span class="shrink-0 text-xs text-gray-900">
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
