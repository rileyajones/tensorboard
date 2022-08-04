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
import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FeatureFlags} from '../types';

@Component({
  selector: 'feature-flag-page-component',
  templateUrl: `feature_flag_page.ng.html`,
})
export class FeatureFlagPageComponent {
  @Input() featureFlags!: FeatureFlags;

  @Output() flagsChanged = new EventEmitter<Partial<FeatureFlags>>();

  getFlagKeys(): string[] {
    return Object.keys(this.featureFlags);
  }

  toggleFlag(flag: keyof FeatureFlags) {
    this.flagsChanged.emit({
      ...this.featureFlags,
      [flag]: !this.featureFlags[flag],
    });
  }
}
