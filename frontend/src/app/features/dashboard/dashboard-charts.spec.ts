import {
  barChartHeight,
  chartColors,
  cycleTimeChart,
  cycleTimeSummary,
  days,
  statusChart,
  statusSummary,
  volumeChart,
  volumeSummary,
  workloadChart,
  workloadSummary,
} from './dashboard-charts';
import { testSummary } from './dashboard.testing';

describe('dashboard charts', () => {
  const summary = testSummary();

  it('plots cases by status as one series, labelled in words', () => {
    const chart = statusChart(summary.casesByStatus);

    expect(chart.data.labels).toEqual(['Open', 'In progress', 'On hold', 'Closed', 'Cancelled']);
    expect(chart.data.datasets).toHaveLength(1);
    expect(chart.data.datasets[0].data).toEqual([1, 9, 2, 6, 0]);
    expect(chart.data.datasets[0].backgroundColor).toBe(chartColors.series);
    expect(chart.options?.indexAxis).toBe('y');
    expect(statusSummary(summary.casesByStatus)).toBe(
      'Cases by status: open 1, in progress 9, on hold 2, closed 6, cancelled 0.',
    );
  });

  it('pairs opened and closed per week', () => {
    const chart = volumeChart(summary.weeklyVolume);

    expect(chart.data.labels).toEqual(['Sep 14', 'Sep 21', 'Sep 28']);
    expect(chart.data.datasets.map((d) => [d.label, d.data])).toEqual([
      ['Opened', [3, 5, 1]],
      ['Closed', [1, 2, 0]],
    ]);
    expect(volumeSummary(summary.weeklyVolume)).toBe(
      'Over the 3 weeks from Sep 14 to Sep 28, 9 cases opened and 3 closed. The most opened in one week was 5, the week of Sep 21.',
    );
  });

  it('stacks overdue tasks at the end of each person’s bar', () => {
    const chart = workloadChart(summary.workload!);

    expect(chart.data.labels).toEqual(['Luis Ortega', 'Dana Whitfield']);
    expect(chart.data.datasets.map((d) => [d.label, d.data])).toEqual([
      ['Not overdue', [3, 2]],
      ['Overdue', [1, 0]],
    ]);
    expect(chart.options?.scales?.['x']?.stacked).toBe(true);
    expect(workloadSummary(summary.workload!)).toBe(
      'Active tasks for 2 people. Busiest: Luis Ortega with 4, 1 overdue. 1 person has overdue tasks.',
    );
  });

  it('says when nobody has work', () => {
    expect(workloadSummary([])).toBe('Nobody has active tasks listed.');
    expect(
      workloadSummary([{ userId: 1, fullName: 'A', role: 'Staff', departmentName: null, activeTasks: 0, overdueTasks: 0 }]),
    ).toBe('Nobody has active tasks.');
  });

  it('charts the median time to close', () => {
    const chart = cycleTimeChart(summary.cycleTimes);

    expect(chart.data.datasets[0].data).toEqual([17.7]);
    expect(cycleTimeSummary(summary.cycleTimes)).toBe('Median time to close, by case type: Building Permit Application 17.7 days.');
  });

  it('formats days and sizes horizontal charts by their rows', () => {
    expect(days(1)).toBe('1 day');
    expect(days(3)).toBe('3 days');
    expect(days(3.46)).toBe('3.5 days');
    expect(barChartHeight(5)).toBeGreaterThan(barChartHeight(2));
    expect(barChartHeight(0)).toBe(barChartHeight(1));
  });
});
