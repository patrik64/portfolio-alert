<script lang="ts">
	import { repo } from 'remult';
	import bell from '$lib/assets/hero-bell.svg';
	import briefcase from '$lib/assets/hero-briefcase.svg';
	import wall from '$lib/assets/hero-wall.svg';
	import { Company } from '../shared/Company';
	import { FUNDS } from '../shared/funds';

	// the companies the newcomers page lists right now, shown on its button
	let newcomers = $state(0);

	$effect(() => {
		repo(Company)
			.count({ isNewcomer: true })
			.then((n) => (newcomers = n))
			// the page is whole without the number
			.catch(() => {});
	});

	// the four buttons share a shape; newcomers is the white one, the rest sit
	// quietly on the card
	const button =
		'flex items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-semibold shadow-sm transition duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-8';
	const quiet = `${button} bg-white/10 text-white ring-1 ring-white/25 ring-inset hover:bg-white/20`;

	// tiles of the wall lit up as newcomers, each a cell of the wall's 40px
	// grid: its column counted from the middle of the card and its row from the
	// top. they keep to where the text never is: the strip above the headline
	// and, on a card wide enough to have them, the margins beside the text and
	// the strip under the buttons
	const lit = [
		{ col: -4, row: 0, delay: 0, from: '' },
		{ col: -12, row: 4, delay: 1.2, from: 'hidden lg:block' },
		{ col: 11, row: 7, delay: 0.7, from: 'hidden lg:block' },
		{ col: 9, row: 12, delay: 3.1, from: 'hidden lg:block' }
	];
</script>

<svelte:head>
	<title>portfolio-alert</title>
	<meta
		name="description"
		content="portfolio-alert reads the portfolio pages of {FUNDS.length.toLocaleString(
			'en-US'
		)} venture capital and private equity funds every night and tells you which companies are new."
	/>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[71rem] sm:px-6">
	<div class="relative isolate overflow-hidden bg-dark-500 shadow-xl sm:rounded-2xl">
		<!-- the background: light falling from the bell's corner in the teal of
		     the statistics charts, a wall of portfolio tiles thinned out behind the
		     text, the bell and its rings, the briefcase, and the tiles lit as new -->
		<div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 select-none">
			<div
				class="absolute inset-0 bg-[radial-gradient(120%_130%_at_88%_0%,#00897b_0%,#00695c_42%,var(--color-dark-500)_100%)]"
			></div>
			<div
				class="absolute inset-0 bg-top [mask-image:radial-gradient(75%_70%_at_50%_50%,rgb(0_0_0/0.25)_30%,#000_100%)]"
				style={`background-image: url("${wall}")`}
			></div>
			<img
				src={bell}
				alt=""
				class="absolute top-[30px] left-[calc(100%-40px)] w-[800px] max-w-none -translate-x-1/2 -translate-y-1/2 sm:top-[60px] sm:left-[calc(100%-70px)] sm:w-[900px] lg:top-[128px] lg:left-[calc(100%-150px)] lg:w-[1200px]"
			/>
			<img
				src={briefcase}
				alt=""
				class="absolute -bottom-24 -left-4 w-44 -rotate-6 sm:-bottom-32 sm:left-6 sm:w-60 lg:-bottom-40 lg:left-14 lg:w-72"
			/>
			{#each lit as tile (`${tile.col}/${tile.row}`)}
				<span
					class={`absolute h-[26px] w-[26px] ${tile.from}`}
					style={`left: calc(50% + ${tile.col * 40 + 7}px); top: ${tile.row * 40 + 7}px`}
				>
					<span class="lit-ring absolute inset-0 rounded-md bg-warning-500" style={`animation-delay: ${tile.delay}s`}
					></span>
					<span class="absolute inset-0 rounded-md bg-warning-500"></span>
				</span>
			{/each}
		</div>

		<div class="relative px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
			<!-- a size down on the narrowest phones, and the second line a size below the
			     name; where it does not fit on one line, it breaks into two even halves
			     rather than leave a word alone -->
			<h1
				class="text-center text-3xl font-extrabold tracking-tight min-[375px]:text-4xl sm:text-5xl lg:text-6xl"
			>
				<span class="block text-white">portfolio-alert</span>
				<span
					class="block text-2xl text-balance text-primary-400 min-[375px]:text-3xl sm:text-4xl lg:text-5xl"
					>discover new startups <span class="text-warning-500">daily</span></span
				>
			</h1>
			<p class="mx-auto mt-6 max-w-lg text-center text-xl text-pretty text-primary-300 sm:max-w-3xl">
				portfolio-alert reads the public portfolio pages of {FUNDS.length.toLocaleString('en-US')}
				venture capital and private equity funds every night and tells you which companies are new.
			</p>
			<!-- the icons are Heroicons' (MIT, Tailwind Labs) -->
			<div class="mx-auto mt-10 max-w-sm sm:flex sm:max-w-none sm:justify-center">
				<div class="space-y-4 sm:mx-auto sm:inline-grid sm:grid-cols-2 sm:gap-5 sm:space-y-0 lg:grid-cols-4">
					<a
						href="/newcomers"
						class={`${button} relative bg-white text-[#00695c] hover:bg-primary-300`}
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								d="M4.214 3.227a.75.75 0 0 0-1.156-.955 8.97 8.97 0 0 0-1.856 3.825.75.75 0 0 0 1.466.316 7.47 7.47 0 0 1 1.546-3.186ZM16.942 2.272a.75.75 0 0 0-1.157.955 7.47 7.47 0 0 1 1.547 3.186.75.75 0 0 0 1.466-.316 8.971 8.971 0 0 0-1.856-3.825Z"
							/>
							<path
								fill-rule="evenodd"
								d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Zm0 14.5a2 2 0 0 1-1.95-1.557 33.54 33.54 0 0 0 3.9 0A2 2 0 0 1 10 16.5Z"
								clip-rule="evenodd"
							/>
						</svg>
						newcomers
						<!-- on the corner, where its arrival moves nothing -->
						{#if newcomers > 0}
							<span
								aria-hidden="true"
								class="absolute -top-2.5 -right-2.5 rounded-full bg-warning-500 px-2 py-0.5 text-xs font-bold text-dark-500 shadow-md"
							>
								+{newcomers.toLocaleString('en-US')}
							</span>
							<span class="sr-only">, {newcomers.toLocaleString('en-US')} new</span>
						{/if}
					</a>
					<a
						href="/search"
						class={quiet}
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
								clip-rule="evenodd"
							/>
						</svg>
						search
					</a>
					<a
						href="/funds"
						class={quiet}
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 0 1 6 4.193V3.75Zm6.5 0v.325a41.622 41.622 0 0 0-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25ZM10 10a1 1 0 0 0-1 1v.01a1 1 0 0 0 1 1h.01a1 1 0 0 0 1-1V11a1 1 0 0 0-1-1H10Z"
								clip-rule="evenodd"
							/>
							<path
								d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686a41.454 41.454 0 0 1-9.274 0C3.985 17.585 3 16.402 3 15.055Z"
							/>
						</svg>
						funds
					</a>
					<a
						href="/statistics"
						class={quiet}
					>
						<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z"
							/>
						</svg>
						statistics
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* a lit tile's ring: the tile's own shape spreading out and fading, slowly,
	   and not at all for a reader who asked for less motion */
	.lit-ring {
		animation: lit-ring 3.6s cubic-bezier(0, 0, 0.2, 1) infinite;
	}

	@keyframes lit-ring {
		0% {
			transform: scale(1);
			opacity: 0.5;
		}
		70%,
		100% {
			transform: scale(2.6);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lit-ring {
			animation: none;
			opacity: 0;
		}
	}
</style>
