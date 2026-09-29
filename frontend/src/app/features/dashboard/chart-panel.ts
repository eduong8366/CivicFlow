import { Component, input } from '@angular/core';
import { BarController, BarElement, CategoryScale, ChartConfiguration, LinearScale, Plugin, Tooltip } from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { chartDefaults } from './dashboard-charts';

export interface LegendKey {
  label: string;
  color: string;
}

let nextId = 0;

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A dashboard chart in a panel: heading, legend (for two or more series), the canvas with a
 * sentence describing it as its accessible name, and the same numbers as a table under "Show the
 * numbers" (the projected content). With `empty` set, the message replaces the chart.
 */
@Component({
  selector: 'app-chart-panel',
  imports: [BaseChartDirective],
  // Only the pieces bar charts use are registered, which keeps Chart.js small.
  providers: [
    provideCharts({
      registerables: [BarController, BarElement, CategoryScale, LinearScale, Tooltip],
      defaults: chartDefaults(reducedMotion),
    }),
  ],
  template: `
    <section class="cf-panel" [attr.aria-labelledby]="headingId">
      <div class="head">
        <h2 [id]="headingId">{{ heading() }}</h2>
        @if (legend().length > 1 && !empty()) {
          <ul class="legend" aria-label="Legend">
            @for (key of legend(); track key.label) {
              <li><span class="swatch" [style.background]="key.color"></span>{{ key.label }}</li>
            }
          </ul>
        }
      </div>
      @if (note()) {
        <p class="note">{{ note() }}</p>
      }

      @if (empty(); as message) {
        <p class="empty">{{ message }}</p>
      } @else {
        <div class="canvas-box" [style.height.px]="height()">
          <canvas
            baseChart
            [type]="config().type"
            [data]="config().data"
            [options]="config().options"
            [plugins]="plugins()"
            role="img"
            [attr.aria-label]="summary()"
          ></canvas>
        </div>
        <details>
          <summary>Show the numbers</summary>
          <ng-content />
        </details>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    section {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      box-sizing: border-box;
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px 16px;

      h2 {
        flex-grow: 1;
        font-size: 1.125rem;
      }
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.875rem;

      li {
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }

    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      // Keeps the key visible when forced colours drop backgrounds.
      outline: 1px solid transparent;
    }

    .note,
    .empty {
      margin: 0;
      color: var(--cf-muted);
    }

    .canvas-box {
      position: relative;
      min-width: 0;
    }

    summary {
      cursor: pointer;
      color: var(--cf-accent);
      font-weight: 600;
    }

    details[open] summary {
      margin-bottom: 8px;
    }
  `,
})
export class ChartPanel {
  readonly heading = input.required<string>();
  readonly config = input.required<ChartConfiguration<'bar', number[], string>>();
  /** What the chart shows, in a sentence or two: the canvas's accessible name. */
  readonly summary = input.required<string>();
  readonly height = input(280);
  readonly legend = input<LegendKey[]>([]);
  readonly plugins = input<Plugin<'bar'>[]>([]);
  readonly note = input<string>();
  /** Shown instead of the chart when there's nothing to plot. */
  readonly empty = input<string | null>(null);

  protected readonly headingId = `chart-heading-${nextId++}`;
}
