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
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ColumnSelectorModal} from './column_selector_modal';

@Component({
  selector: 'tb-data-table-column-selector',
  template: '',
  styles: [],
})
export class ColumnSelectorContainer {
  @Input() potentialColumns!: ColumnHeader[];
  @Input() currentColumns!: ColumnHeader[];
  @Output() columnSelected = new EventEmitter<ColumnHeader>();

  private columnSelectorDialog?: MatDialogRef<ColumnSelectorModal>;

  constructor(private dialog: MatDialog) {}
}
