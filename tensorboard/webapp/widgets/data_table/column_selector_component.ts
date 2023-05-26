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
import {Component, EventEmitter, Output, Input} from '@angular/core';
import {ColumnHeader} from './types';

@Component({
  selector: 'tb-data-table-column-selector-component',
  templateUrl: 'column_selector_component.ng.html',
  styleUrls: ['column_selector_component.css'],
})
export class ColumnSelectorComponent {
  @Input() potentialColumns!: ColumnHeader[];
  @Input() currentColumns!: ColumnHeader[];
  @Output() columnSelected = new EventEmitter<ColumnHeader>();

  searchInput = '';

  getPotentialColumns() {
    const currentColumnNames = new Set(
      this.currentColumns.map(({name}) => name)
    );
    return this.potentialColumns.filter((columnHeader) => {
      return (
        !currentColumnNames.has(columnHeader.name) &&
        columnHeader.name.match(this.searchInput)
      );
    });
  }
}
