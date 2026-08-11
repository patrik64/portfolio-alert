<script lang="ts">
	import { repo } from 'remult';
	import { Fund } from '../shared/Fund';
	import { FUNDS } from '../shared/funds';
	import { ScrapeController } from '../shared/ScrapeController';

	type Status = 'pending' | 'running' | 'done' | 'error';

	let funds = $state<Record<string, Fund>>({});
	let statuses = $state<Record<string, Status>>({});
	let running = $state(false);

	const cards = $derived(
		FUNDS.map((f) => ({ ...f, fund: funds[f.slug], status: statuses[f.slug] }))
	);

	async function reloadFunds() {
		const rows = await repo(Fund).find({ limit: 100 });
		funds = Object.fromEntries(rows.map((f) => [f.slug, f]));
	}

	$effect(() => {
		reloadFunds();
	});

	async function runFetch(slug: string) {
		statuses[slug] = 'running';
		try {
			await ScrapeController.fetchFund(slug);
			statuses[slug] = 'done';
		} catch {
			statuses[slug] = 'error';
		}
		await reloadFunds();
	}

	async function fetchOne(slug: string) {
		if (running || statuses[slug] === 'running') return;
		await runFetch(slug);
	}

	async function fetchAll() {
		if (running) return;
		running = true;
		statuses = Object.fromEntries(FUNDS.map((f) => [f.slug, 'pending' as Status]));
		const queue = FUNDS.map((f) => f.slug);
		// 5 workers drain the queue; one fund failing doesn't stop the rest
		await Promise.all(
			Array.from({ length: 5 }, async () => {
				let slug: string | undefined;
				while ((slug = queue.shift())) {
					await runFetch(slug);
				}
			})
		);
		running = false;
	}

	const chipClasses: Record<Status, string> = {
		pending: 'bg-gray-200 text-gray-600',
		running: 'animate-pulse bg-tertiary-500 text-white',
		done: 'bg-success-500 text-white',
		error: 'bg-danger-500 text-white'
	};
</script>

<svelte:head>
	<title>portfolio alert</title>
</svelte:head>

<div
	class="mx-auto mt-2 w-full max-w-[71rem] px-6 py-4 lg:dashed-frame"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">funds</h1>
		<button
			type="button"
			onclick={fetchAll}
			disabled={running}
			class="rounded-md border border-transparent bg-primary-600 px-4 py-1 text-sm leading-5 font-semibold text-white shadow-sm transition duration-150 ease-in-out hover:bg-primary-400 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:bg-gray-300"
		>
			{running ? 'fetching…' : 'fetch all'}
		</button>
	</div>

	<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each cards as card (card.slug)}
			<div
				class="group relative rounded-lg bg-white px-4 py-3 shadow-lg transition duration-500 ease-in-out hover:bg-light-500"
			>
				<div class="flex items-start justify-between gap-2">
					<!-- stretched link: the ::after overlay makes the whole card clickable -->
					<a
						href={`/funds/${card.slug}`}
						class="font-semibold text-gray-800 transition duration-150 after:absolute after:inset-0 group-hover:text-tertiary-600"
					>
						{card.name}
					</a>
					{#if card.status}
						<span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${chipClasses[card.status]}`}>
							{card.status}
						</span>
					{/if}
				</div>
				<div class="mt-2 flex items-center gap-2 text-sm text-gray-600">
					<span>{card.fund ? `${card.fund.companyCount} companies` : 'never fetched'}</span>
					{#if card.fund && card.fund.newCount > 0}
						<span class="rounded-full bg-warning-500 px-2 py-0.5 text-xs font-semibold text-white">
							+{card.fund.newCount} new
						</span>
					{/if}
				</div>
				<div class="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
					<span>
						{card.fund?.lastFetchedAt
							? `fetched ${card.fund.lastFetchedAt.toLocaleString()}`
							: ''}
					</span>
					<button
						type="button"
						aria-label={`refresh ${card.name}`}
						onclick={() => fetchOne(card.slug)}
						disabled={running || card.status === 'running'}
						class="relative rounded-md px-2 py-0.5 font-semibold text-primary-700 transition duration-150 ease-in-out hover:bg-primary-300 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:text-gray-400"
					>
						refresh
					</button>
				</div>
				{#if card.fund?.lastError}
					<p class="mt-1 text-xs text-danger-500">{card.fund.lastError}</p>
				{/if}
			</div>
		{/each}
	</div>
</div>
