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
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  Input,
  Inject,
} from '@angular/core';
import {ColumnHeader} from './types';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';

@Component({
  selector: 'tb-data-table-column-selector-modal',
  templateUrl: 'column_selector_modal.ng.html',
  styleUrls: ['column_selector_modal.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColumnSelectorModal {
  searchInput = '';

  // potentialColumns: ColumnHeader[];
  // currentColumns: Set<ColumnHeader>;
  @Output() columnSelected = new EventEmitter<ColumnHeader>();

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: {
      potentialColumns: ColumnHeader[];
      currentColumns: Set<ColumnHeader>;
    }
  ) {}

  getPotentialColumns() {
    return this.data.potentialColumns.filter((columnHeader) => {
      !this.data.currentColumns.has(columnHeader);
    });
  }
}
