/* Copyright 2022 The TensorFlow Authors. All Rights Reserved.

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
import {ColumnHeader, ColumnHeaderType} from './types';
import {
  intlNumberFormatter,
  numberFormatter,
  relativeTimeFormatter,
} from '../line_chart_v2/lib/formatter';

@Component({
  selector: 'tb-data-table-cell',
  template: `
    <td *ngIf="showColumn()" [ngSwitch]="header">
      <div *ngSwitchCase="ColumnHeadersType.VALUE_CHANGE" class="cell">
        <ng-container
          *ngTemplateOutlet="arrow; context: {$implicit: runData[header.name]}"
        ></ng-container>
        {{ getFormattedDataForColumn() }}
      </div>
      <div *ngSwitchCase="ColumnHeadersType.PERCENTAGE_CHANGE" class="cell">
        <ng-container
          *ngTemplateOutlet="arrow; context: {$implicit: runData[header.name]}"
        ></ng-container>
        {{ getFormattedDataForColumn() }}
      </div>
      <div *ngSwitchDefault class="cell extra-right-padding">
        {{ getFormattedDataForColumn() }}
      </div>
    </td>
  `,
  styleUrls: ['data_table_component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableCell {
  @Input() header!: ColumnHeader;
  @Input() datum!: string | number | undefined;
  @Input() smoothingEnabled!: boolean;

  readonly ColumnHeadersType = ColumnHeaderType;

  showColumn() {
    return (
      this.header.enabled &&
      (this.smoothingEnabled || this.header.type !== ColumnHeaderType.SMOOTHED)
    );
  }

  getFormattedDataForColumn(): string {
    if (this.datum === undefined) {
      return '';
    }
    switch (this.header.type) {
      case ColumnHeaderType.RUN:
        return this.datum as string;
      case ColumnHeaderType.VALUE:
      case ColumnHeaderType.STEP:
      case ColumnHeaderType.SMOOTHED:
      case ColumnHeaderType.START_STEP:
      case ColumnHeaderType.END_STEP:
      case ColumnHeaderType.START_VALUE:
      case ColumnHeaderType.END_VALUE:
      case ColumnHeaderType.MIN_VALUE:
      case ColumnHeaderType.MAX_VALUE:
      case ColumnHeaderType.STEP_AT_MAX:
      case ColumnHeaderType.STEP_AT_MIN:
      case ColumnHeaderType.MEAN:
        return intlNumberFormatter.formatShort(this.datum as number);
      case ColumnHeaderType.TIME:
        const time = new Date(this.datum!);
        return time.toISOString();
      case ColumnHeaderType.RELATIVE_TIME:
        return relativeTimeFormatter.formatReadable(this.datum as number);
      case ColumnHeaderType.VALUE_CHANGE:
        return intlNumberFormatter.formatShort(Math.abs(this.datum as number));
      case ColumnHeaderType.PERCENTAGE_CHANGE:
        return Math.round((this.datum as number) * 100).toString() + '%';
      case ColumnHeaderType.RAW_CHANGE:
        return numberFormatter.formatShort(Math.abs(this.datum as number));
      default:
        return '';
    }
  }
}
