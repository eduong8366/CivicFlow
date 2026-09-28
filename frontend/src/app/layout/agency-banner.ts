import { Component } from '@angular/core';
import { environment } from '../../environments/environment';

/** The thin strip above the header naming the agency, as government sites carry. */
@Component({
  selector: 'app-agency-banner',
  template: `<div class="banner">{{ agencyName }} · Internal case management system</div>`,
  styles: `
    .banner {
      background: var(--cf-ink);
      color: #f0f0f0;
      font-size: 0.8125rem;
      padding: 4px 32px;
    }

    @media (max-width: 959.98px) {
      .banner {
        padding: 4px 16px;
      }
    }
  `,
})
export class AgencyBanner {
  protected readonly agencyName = environment.agencyName;
}
