import type { ChartConfiguration, Plugin } from 'chart.js';
import { PALETTE } from './palette';

// Chart.js configuration factories, after the ones in beige-book-analyser.
// Shared conventions: one hue, thin bars rounded at the data end and square
// at the baseline, a hairline solid grid or none, text in ink rather than in
// the bar's colour, and a tooltip on every bar — which only ever repeats what
// the labels and the table under the chart already say.

const FONT = "'DM Sans', Helvetica, sans-serif";

// a short grow rather than chart.js's full second, and none for a reader who
// has asked for less motion
const animation = () =>
	matchMedia('(prefers-reduced-motion: reduce)').matches ? (false as const) : { duration: 350 };

// in a tooltip the number leads: the reader is already on the bar and knows
// what it is, so its name is the quiet line and its count the strong one
const tooltip = {
	backgroundColor: PALETTE.surface,
	titleColor: PALETTE.textSecondary,
	bodyColor: PALETTE.textPrimary,
	footerColor: PALETTE.textSecondary,
	borderColor: PALETTE.axis,
	borderWidth: 1,
	padding: 10,
	cornerRadius: 6,
	// one series, so there is no colour to key
	displayColors: false,
	titleFont: { family: FONT, size: 12, weight: 400 as const },
	bodyFont: { family: FONT, size: 13, weight: 600 as const },
	footerFont: { family: FONT, size: 12, weight: 400 as const },
	footerMarginTop: 2
};

const companies = (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'company' : 'companies'}`;

// the count written at the tip of each bar: with every bar labelled, the
// chart needs no value axis and no grid
const valueLabels: Plugin<'bar'> = {
	id: 'valueLabels',
	afterDatasetsDraw(chart) {
		const { ctx } = chart;
		const sideways = chart.options.indexAxis === 'y';
		ctx.save();
		ctx.font = `600 12px ${FONT}`;
		ctx.fillStyle = PALETTE.textPrimary;
		ctx.textAlign = sideways ? 'left' : 'center';
		ctx.textBaseline = sideways ? 'middle' : 'bottom';
		chart.getDatasetMeta(0).data.forEach((bar, i) => {
			const value = chart.data.datasets[0].data[i];
			if (typeof value !== 'number') return;
			const text = value.toLocaleString('en');
			if (sideways) ctx.fillText(text, bar.x + 6, bar.y);
			else ctx.fillText(text, bar.x, bar.y - 4);
		});
		ctx.restore();
	}
};

// a name beside its bar gets two fifths of the chart at most, so that the
// bars keep the rest: one too long for that is cut short with an ellipsis —
// shorter still on a narrow screen — and stays whole in the tooltip and in
// the table
const NAME_SHARE = 0.4;
const NAME_WIDTH = 210;
const NAME_FONT = `12px ${FONT}`;

function fitted(ctx: CanvasRenderingContext2D, name: string, width: number) {
	ctx.save();
	ctx.font = NAME_FONT;
	let cut = name;
	while (cut.length > 1 && ctx.measureText(cut === name ? name : `${cut}…`).width > width)
		cut = cut.slice(0, -1).trimEnd();
	ctx.restore();
	return cut === name ? name : `${cut}…`;
}

export interface BarRow {
	label: string;
	count: number;
}

// a ranking: one bar a row, the largest on top, its name beside it — cut
// short when long, and whole in the tooltip — and its count at its tip
export function rankedBarsConfig<Row extends BarRow>(
	rows: Row[],
	// what the tooltip adds under a row's name and count
	note: (row: Row) => string
): ChartConfiguration<'bar'> {
	return {
		type: 'bar',
		data: {
			labels: rows.map((row) => row.label),
			datasets: [
				{
					data: rows.map((row) => row.count),
					backgroundColor: PALETTE.accent,
					hoverBackgroundColor: PALETTE.accentHover,
					borderRadius: 4,
					maxBarThickness: 18
				}
			]
		},
		options: {
			indexAxis: 'y',
			responsive: true,
			maintainAspectRatio: false,
			animation: animation(),
			// the whole row answers the pointer, not only the painted bar
			interaction: { mode: 'index', axis: 'y', intersect: false },
			// room for the count at the tip of the longest bar
			layout: { padding: { right: 44 } },
			scales: {
				x: { display: false, min: 0, max: Math.max(1, ...rows.map((row) => row.count)) },
				y: {
					grid: { display: false },
					border: { color: PALETTE.axis },
					ticks: {
						color: PALETTE.textSecondary,
						font: { family: FONT, size: 12 },
						autoSkip: false,
						callback(value) {
							const name = this.getLabelForValue(Number(value));
							return fitted(this.ctx, name, Math.min(NAME_WIDTH, this.chart.width * NAME_SHARE));
						}
					}
				}
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					...tooltip,
					callbacks: {
						label: (item) => companies(rows[item.dataIndex].count),
						footer: (items) => note(rows[items[0].dataIndex])
					}
				}
			}
		},
		plugins: [valueLabels]
	};
}

// a day that could not be counted is not a day that brought nothing, so its
// slot is shaded rather than left looking like a zero
const uncountedDays: Plugin<'bar'> = {
	id: 'uncountedDays',
	beforeDatasetsDraw(chart) {
		const { ctx, chartArea, scales } = chart;
		const half = (scales.x.getPixelForValue(1) - scales.x.getPixelForValue(0)) / 2;
		ctx.save();
		ctx.fillStyle = PALETTE.gridline;
		chart.data.datasets[0].data.forEach((value, i) => {
			if (value != null) return;
			// a hair wider than the slot, so that neighbours join into one band
			const left = scales.x.getPixelForValue(i) - half;
			ctx.fillRect(left, chartArea.top, half * 2 + 0.5, chartArea.bottom - chartArea.top);
		});
		ctx.restore();
	}
};

// a month day by day: a column for each day's finds, and shade over the days
// that could bring none
export function dayColumnsConfig(
	days: (number | null)[],
	// the day as the tooltip names it, from its place in the month
	title: (index: number) => string
): ChartConfiguration<'bar'> {
	return {
		type: 'bar',
		data: {
			labels: days.map((_, i) => String(i + 1)),
			datasets: [
				{
					// a copy: chart.js hooks into the array it is given
					data: [...days],
					backgroundColor: PALETTE.accent,
					hoverBackgroundColor: PALETTE.accentHover,
					borderRadius: 4,
					maxBarThickness: 24,
					categoryPercentage: 0.9,
					barPercentage: 0.85
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: animation(),
			interaction: { mode: 'index', intersect: false },
			scales: {
				x: {
					grid: { display: false },
					border: { color: PALETTE.axis },
					ticks: { color: PALETTE.muted, font: { family: FONT, size: 11 }, maxRotation: 0 }
				},
				y: {
					beginAtZero: true,
					grid: { color: PALETTE.gridline, drawTicks: false },
					border: { display: false },
					ticks: {
						color: PALETTE.muted,
						font: { family: FONT, size: 11 },
						padding: 8,
						precision: 0,
						maxTicksLimit: 5
					}
				}
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					...tooltip,
					callbacks: {
						title: (items) => title(items[0].dataIndex),
						label: (item) => companies(Number(item.parsed.y))
					}
				}
			}
		},
		plugins: [uncountedDays]
	};
}

export interface MonthColumn {
	// one line, or two where the year is worth saying
	label: string | string[];
	// the month in full, for the tooltip
	title: string;
	count: number;
}

// every month side by side, the one on show in the accent and the rest in
// grey around it; a click on a column asks for that month
export function monthColumnsConfig(
	months: MonthColumn[],
	shown: number,
	choose: (index: number) => void
): ChartConfiguration<'bar'> {
	return {
		type: 'bar',
		data: {
			labels: months.map((month) => month.label),
			datasets: [
				{
					data: months.map((month) => month.count),
					backgroundColor: months.map((_, i) => (i === shown ? PALETTE.accent : PALETTE.context)),
					hoverBackgroundColor: months.map((_, i) =>
						i === shown ? PALETTE.accentHover : PALETTE.contextHover
					),
					borderRadius: 4,
					maxBarThickness: 24
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: animation(),
			interaction: { mode: 'index', intersect: false },
			// room for the count on top of the tallest column
			layout: { padding: { top: 20 } },
			onClick: (_event, elements) => {
				if (elements[0]) choose(elements[0].index);
			},
			onHover: (event, elements) => {
				const target = event.native?.target;
				if (target instanceof HTMLElement) target.style.cursor = elements[0] ? 'pointer' : 'default';
			},
			scales: {
				x: {
					grid: { display: false },
					border: { color: PALETTE.axis },
					ticks: { color: PALETTE.textSecondary, font: { family: FONT, size: 11 }, maxRotation: 0 }
				},
				y: { display: false, beginAtZero: true }
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					...tooltip,
					callbacks: {
						title: (items) => months[items[0].dataIndex].title,
						label: (item) => companies(Number(item.parsed.y))
					}
				}
			}
		},
		plugins: [valueLabels]
	};
}
