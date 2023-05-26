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
  Component,
  EventEmitter,
  Output,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
  OnInit,
} from '@angular/core';
import {ColumnHeader} from './types';
import {BehaviorSubject, tap} from 'rxjs';

@Component({
  selector: 'tb-data-table-column-selector-component',
  templateUrl: 'column_selector_component.ng.html',
  styleUrls: ['column_selector_component.css'],
})
export class ColumnSelectorComponent implements AfterViewInit {
  @Input() selectableColumns!: ColumnHeader[];
  @Output() columnSelected = new EventEmitter<ColumnHeader>();

  @ViewChild('search')
  private readonly searchField!: ElementRef;

  searchInput = '';
  selectedIndex$ = new BehaviorSubject(0);

  ngAfterViewInit() {
    this.searchInput = '';
    this.searchField.nativeElement.focus();
    this.selectedIndex$.next(0);
  }

  getFilteredColumns() {
    return this.selectableColumns.filter((columnHeader) =>
      columnHeader.name.match(this.searchInput)
    );
  }

  searchInputChanged() {
    this.selectedIndex$.next(0);
  }

  selectColumn(header: ColumnHeader) {
    this.selectedIndex$.next(0);
    this.columnSelected.emit(header);
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onUpArrow() {
    this.selectedIndex$.next(Math.max(this.selectedIndex$.getValue() - 1, 0));
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  onDownArrow() {
    this.selectedIndex$.next(
      Math.min(
        this.selectedIndex$.getValue() + 1,
        this.selectableColumns.length - 1
      )
    );
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnterPressed() {
    this.selectColumn(this.selectableColumns[this.selectedIndex$.getValue()]);
  }
}
