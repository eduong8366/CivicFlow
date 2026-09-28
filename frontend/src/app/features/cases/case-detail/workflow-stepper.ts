import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { WorkflowTask } from '../../../core/api/cases.models';
import { workflowSteps } from './workflow-steps';

/**
 * The case's workflow as a strip of steps: done, current and still to come, with who has each one.
 * An ordered list, so a screen reader hears "list, 4 items" and each step's position and state.
 */
@Component({
  selector: 'app-workflow-stepper',
  imports: [DatePipe],
  template: `
    <ol class="steps" aria-label="Workflow steps">
      @for (step of steps(); track step.sequence) {
        <li class="step" [class]="'step step--' + step.state" [attr.aria-current]="step.state === 'current' ? 'step' : null">
          <div class="position">
            <span class="cf-visually-hidden">Step {{ step.sequence }} of {{ steps().length }}:</span>
            <span aria-hidden="true">Step {{ step.sequence }} · </span>{{ step.stateLabel }}
          </div>
          <div class="name">{{ step.name }}</div>
          <div class="who">
            @switch (step.state) {
              @case ('current') {
                {{ step.task.assigneeName ?? step.task.departmentName + ' queue' }}
                @if (step.task.dueDate) {
                  · due {{ step.task.dueDate | date: 'MMM d' }}
                }
              }
              @case ('pending') {
                {{ step.task.departmentName }}
              }
              @case ('skipped') {
                {{ step.task.departmentName }}
              }
              @default {
                {{ step.task.assigneeName ?? step.task.departmentName }}
                @if (step.task.completedAt) {
                  · {{ step.task.completedAt | date: 'MMM d' }}
                }
              }
            }
          </div>
          @if (step.state === 'current' && onHold()) {
            <div class="flag">Paused: case on hold</div>
          } @else if (step.state === 'current' && step.task.isOverdue) {
            <div class="flag">Overdue</div>
          }
          @if (step.attempts > 1) {
            <div class="attempts">Attempt {{ step.attempts }}</div>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .steps {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      background: var(--cf-surface);
      border: 1px solid var(--cf-border);
    }

    .step {
      padding: 12px 18px 14px;
      border-top: 6px solid var(--cf-border);
    }

    .position {
      font-size: 0.8125rem;
      color: var(--cf-muted);
    }

    .name {
      font-weight: 700;
    }

    .who,
    .attempts {
      font-size: 0.8125rem;
    }

    .attempts {
      color: var(--cf-muted);
    }

    .flag {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--cf-danger);
    }

    // Border colours are at least 3:1 against white (WCAG 1.4.11); the state is also in the text.
    .step--done {
      border-top-color: #008817;
    }

    .step--rejected {
      border-top-color: var(--cf-danger);
    }

    .step--current {
      border-top-color: var(--cf-accent);
      background: var(--cf-accent-tint);

      .position {
        color: var(--cf-accent);
        font-weight: 700;
      }
    }

    .step--skipped .name {
      color: var(--cf-muted);
      text-decoration: line-through;
    }
  `,
})
export class WorkflowStepper {
  readonly tasks = input.required<readonly WorkflowTask[]>();
  /** An on-hold case's current step is paused, not overdue. */
  readonly onHold = input(false);

  protected readonly steps = computed(() => workflowSteps(this.tasks()));
}
