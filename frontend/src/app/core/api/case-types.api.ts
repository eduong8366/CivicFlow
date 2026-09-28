import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CaseType } from './cases.models';

/** Active case types with their form fields and steps, for opening cases. */
@Injectable({ providedIn: 'root' })
export class CaseTypesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<CaseType[]> {
    return this.http.get<CaseType[]>('/api/case-types');
  }
}
