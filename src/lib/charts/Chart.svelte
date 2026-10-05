<script lang="ts">
	import {
		BarController,
		BarElement,
		CategoryScale,
		Chart as ChartJS,
		LinearScale,
		Tooltip,
		type ChartConfiguration
	} from 'chart.js';

	// only what a bar chart needs, so the rest of chart.js stays out of the bundle
	ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

	interface Props {
		// called to build the chart, and again whenever anything it read has
		// changed — which is how a chart follows the month on show
		config: () => ChartConfiguration<'bar'>;
		height?: number;
		// describes the chart for screen readers; the table under it carries the data
		label: string;
	}

	let { config, height = 320, label }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();

	$effect(() => {
		if (!canvas) return;
		const chart = new ChartJS(canvas, config());
		// canvas text is drawn in whatever font is at hand at that moment; when
		// the page's own arrives only afterwards, the chart is drawn once more
		let live = true;
		document.fonts?.ready.then(() => {
			if (live) chart.update('none');
		});
		return () => {
			live = false;
			chart.destroy();
		};
	});
</script>

<div class="relative w-full" style="height: {height}px">
	<!-- the label doubles as the canvas fallback, for assistive tech and for
	     anyone the canvas fails for -->
	<canvas bind:this={canvas} aria-label={label}>{label}</canvas>
</div>
