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
} from '@angular/core';
import {ColumnHeader} from './types';
import {BehaviorSubject} from 'rxjs';

@Component({
  selector: 'tb-data-table-column-selector',
  template: `
    <div class="content" #content (click)="$event.stopPropagation()">
      <tb-data-table-column-selector-component
        *ngIf="visible$ | async"
        [potentialColumns]="potentialColumns"
        [currentColumns]="currentColumns"
        (columnSelected)="columnSelected.emit($event)"
      ></tb-data-table-column-selector-component>
    </div>
  `,
  styles: [
    `
      .content {
        position: absolute;
      }
    `,
  ],
})
export class ColumnSelectorContainer {
  @Input() potentialColumns!: ColumnHeader[];
  @Input() currentColumns!: ColumnHeader[];
  @Output() columnSelected = new EventEmitter<ColumnHeader>();

  visible$ = new BehaviorSubject(false);

  @ViewChild('content', {static: false})
  private readonly content!: ElementRef;
  private clickListener: any = this.onDocumentClicked.bind(this);

  public openAtPosition(position: {x: number; y: number}) {
    this.content.nativeElement.style.left = position.x + 'px';
    this.content.nativeElement.style.top = position.y + 'px';
    this.visible$.next(true);
    document.addEventListener('click', this.clickListener);
  }

  public close() {
    document.removeEventListener('click', this.clickListener);
    this.visible$.next(false);
  }

  onDocumentClicked() {
    this.close();
  }
}
