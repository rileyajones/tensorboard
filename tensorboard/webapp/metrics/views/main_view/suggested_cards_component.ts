/* Copyright 2023 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {CardObserver} from '../card_renderer/card_lazy_loader';
import {CardIdWithMetadata} from '../metrics_view_types';

@Component({
  selector: 'metrics-suggested-cards-component',
  template: `
    <ng-container *ngIf="cardIdsWithMetadata.length">
      <div class="group-toolbar">
        <mat-icon svgIcon="science_24px"></mat-icon>
        <span class="group-text">
          <span class="group-title" aria-role="heading" aria-level="3"
            >Suggested Cards</span
          >
          <span *ngIf="cardIdsWithMetadata.length > 1" class="group-card-count"
            >{{ cardIdsWithMetadata.length }} cards</span
          >
        </span>
      </div>
      <metrics-card-grid
        [cardIdsWithMetadata]="cardIdsWithMetadata"
        [cardObserver]="cardObserver"
      ></metrics-card-grid>
    </ng-container>
  `,
  styleUrls: ['suggested_cards_component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestedCardsComponent {
  @Input() cardObserver!: CardObserver;
  @Input() cardIdsWithMetadata!: CardIdWithMetadata[];
}
