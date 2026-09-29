import { formatDate } from '@angular/common';
import type { ChartConfiguration, ChartOptions, Defaults, Plugin } from 'chart.js';
import { CycleTime, StatusCount, WeeklyVolume, WorkloadEntry } from '../../core/api/dashboard.models';
import { caseStatusLabel } from '../../shared/labels';

// Chart configurations built from the dashboard summary. Pure, so they can be tested without a
// canvas. Every chart also gets a sentence for screen readers and a table of the same numbers.

/**
 * Chart colours, checked with the dataviz palette validator against the white panel: each pair is
 * far apart for every colour-vision type, and every fill clears 3:1. The brand navy is too dark for
 * a data mark, so bars use the USWDS blue-60v. Overdue is the app's danger red, as elsewhere.
 */
export const chartColors = {
  series: '#005ea2',
  closed: '#c2850c',
  overdue: '#b50909',
  surface: '#ffffff',
  ink: '#1b1b1b',
  muted: '#565c65',
  grid: '#dfe1e2',
} as const;

const fontFamily = "'Public Sans', system-ui, sans-serif";

/** Thin bars with a rounded data end, square at the baseline. */
const barStyle = { maxBarThickness: 24, borderRadius: 4, borderSkipped: 'start' } as const;

/** Row height of a horizontal bar chart, and the band the value axis needs below the rows. */
const rowHeight = 36;
const axisBand = 56;

/** Global Chart.js defaults, handed to `provideCharts`. */
export function chartDefaults(reducedMotion: boolean): Partial<Defaults> {
  return {
    font: { family: fontFamily, size: 13 } as Defaults['font'],
    color: chartColors.muted,
    borderColor: chartColors.grid,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : ({ duration: 300 } as Defaults['animation']),
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: chartColors.ink,
        cornerRadius: 0,
        padding: 10,
        boxPadding: 4,
        titleFont: { weight: 'bold' },
      },
    },
  } as Partial<Defaults>;
}

/** The height a horizontal bar chart needs for `rows` rows, value axis included. */
export function barChartHeight(rows: number): number {
  return Math.max(rows, 1) * rowHeight + axisBand;
}

type BarConfig = ChartConfiguration<'bar', number[], string>;

/** Options shared by the horizontal bar charts: hovering anywhere on a row shows its tooltip. */
function horizontalOptions(valueTitle: string, stacked = false): ChartOptions<'bar'> {
  return {
    indexAxis: 'y',
    interaction: { mode: 'index', axis: 'y', intersect: false },
    // Room for the value printed past the end of the longest bar.
    layout: { padding: { right: 36 } },
    scales: {
      x: {
        stacked,
        beginAtZero: true,
        border: { display: false },
        ticks: { precision: 0 },
        title: { display: true, text: valueTitle },
      },
      y: { stacked, grid: { display: false }, border: { color: chartColors.muted }, ticks: { color: chartColors.ink } },
    },
  };
}

/** Cases by status: one series, so one colour; the status names label the rows. */
export function statusChart(counts: StatusCount[]): BarConfig {
  return {
    type: 'bar',
    data: {
      labels: counts.map((c) => caseStatusLabel(c.status)),
      datasets: [{ label: 'Cases', data: counts.map((c) => c.count), backgroundColor: chartColors.series, ...barStyle }],
    },
    options: horizontalOptions('Cases'),
  };
}

/** Opened and closed per week, side by side. */
export function volumeChart(weeks: WeeklyVolume[]): BarConfig {
  return {
    type: 'bar',
    data: {
      labels: weeks.map((w) => shortDate(w.weekStart)),
      datasets: [
        { label: 'Opened', data: weeks.map((w) => w.opened), backgroundColor: chartColors.series, ...barStyle },
        { label: 'Closed', data: weeks.map((w) => w.closed), backgroundColor: chartColors.closed, ...barStyle },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          border: { color: chartColors.muted },
          title: { display: true, text: 'Week starting' },
          ticks: { maxRotation: 0, autoSkipPadding: 12 },
        },
        y: { beginAtZero: true, border: { display: false }, ticks: { precision: 0 }, title: { display: true, text: 'Cases' } },
      },
      plugins: { tooltip: { callbacks: { title: (items) => `Week of ${items[0]?.label ?? ''}` } } },
    },
  };
}

/** Active tasks per person, the overdue share stacked at the end of each bar. */
export function workloadChart(entries: WorkloadEntry[]): BarConfig {
  return {
    type: 'bar',
    data: {
      labels: entries.map((e) => e.fullName),
      datasets: [
        {
          label: 'Not overdue',
          data: entries.map((e) => e.activeTasks - e.overdueTasks),
          backgroundColor: chartColors.series,
          // A 2px gap in the panel colour separates it from the overdue segment.
          borderColor: chartColors.surface,
          borderWidth: { right: 2 },
          ...barStyle,
        },
        { label: 'Overdue', data: entries.map((e) => e.overdueTasks), backgroundColor: chartColors.overdue, ...barStyle },
      ],
    },
    options: {
      ...horizontalOptions('Active tasks', true),
      plugins: {
        tooltip: {
          callbacks: {
            title: (items) => {
              const entry = entries[items[0]?.dataIndex ?? -1];
              return entry ? [entry.fullName, [entry.role, entry.departmentName].filter(Boolean).join(' · ')] : '';
            },
          },
        },
      },
    },
  };
}

/** Median days to close per case type; the average is in the tooltip and the table. */
export function cycleTimeChart(cycleTimes: CycleTime[]): BarConfig {
  return {
    type: 'bar',
    data: {
      labels: cycleTimes.map((c) => c.caseTypeName),
      datasets: [
        { label: 'Median days', data: cycleTimes.map((c) => c.medianDays), backgroundColor: chartColors.series, ...barStyle },
      ],
    },
    options: {
      ...horizontalOptions('Median days'),
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => {
              const c = cycleTimes[item.dataIndex];
              return c ? [`Median ${days(c.medianDays)}`, `Average ${days(c.averageDays)}`, `${c.closedCount} closed`] : '';
            },
          },
        },
      },
    },
  };
}

/**
 * Prints each bar's total just past its end (horizontal charts only), so the numbers can be read
 * without hovering. Stacked bars get one total, not a number per segment.
 */
export function barEndLabels(format: (value: number) => string = String): Plugin<'bar'> {
  return {
    id: 'cfBarEndLabels',
    afterDatasetsDraw(chart) {
      const metas = chart.getSortedVisibleDatasetMetas();
      const last = metas.at(-1);
      if (!last) {
        return;
      }

      const { ctx } = chart;
      ctx.save();
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillStyle = chartColors.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      last.data.forEach((bar, index) => {
        const total = metas.reduce((sum, meta) => sum + Number(chart.data.datasets[meta.index].data[index] ?? 0), 0);
        const { x, y } = bar.getProps(['x', 'y'], true);
        ctx.fillText(format(total), x + 6, y);
      });
      ctx.restore();
    },
  };
}

// Sentences that say what each chart shows, for its accessible name.

export function statusSummary(counts: StatusCount[]): string {
  const parts = counts.map((c) => `${caseStatusLabel(c.status).toLowerCase()} ${c.count}`);
  return `Cases by status: ${parts.join(', ')}.`;
}

export function volumeSummary(weeks: WeeklyVolume[]): string {
  if (weeks.length === 0) {
    return 'No weekly figures.';
  }

  const opened = sum(weeks.map((w) => w.opened));
  const closed = sum(weeks.map((w) => w.closed));
  const busiest = weeks.reduce((top, w) => (w.opened > top.opened ? w : top));
  const range = `the ${weeks.length} weeks from ${shortDate(weeks[0].weekStart)} to ${shortDate(weeks.at(-1)!.weekStart)}`;
  const peak = busiest.opened > 0 ? ` The most opened in one week was ${busiest.opened}, the week of ${shortDate(busiest.weekStart)}.` : '';
  return `Over ${range}, ${plural(opened, 'case')} opened and ${closed} closed.${peak}`;
}

export function workloadSummary(entries: WorkloadEntry[]): string {
  const busiest = entries[0];
  if (!busiest || busiest.activeTasks === 0) {
    return `Nobody has active tasks${entries.length ? '' : ' listed'}.`;
  }

  const withOverdue = entries.filter((e) => e.overdueTasks > 0).length;
  return (
    `Active tasks for ${plural(entries.length, 'person', 'people')}. Busiest: ${busiest.fullName} with ${busiest.activeTasks}` +
    `, ${busiest.overdueTasks} overdue. ${withOverdue === 0 ? 'Nobody has' : `${plural(withOverdue, 'person has', 'people have')}`} overdue tasks.`
  );
}

export function cycleTimeSummary(cycleTimes: CycleTime[]): string {
  const parts = cycleTimes.map((c) => `${c.caseTypeName} ${days(c.medianDays)}`);
  return `Median time to close, by case type: ${parts.join(', ')}.`;
}

/** "Sep 7" for a `yyyy-MM-dd` day. */
export function shortDate(day: string): string {
  return formatDate(day, 'MMM d', 'en-US');
}

/** "3.5 days", "1 day". */
export function days(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, '')} ${value === 1 ? 'day' : 'days'}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
