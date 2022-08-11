import {FeatureFlags} from '../types';

export const enum FeatureFlagStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  DEFAULT = 'default',
}

export type FeatureFlagState<K extends keyof FeatureFlags> = {
  flag: K;
  status: FeatureFlagStatus;
  defaultValue: FeatureFlags[K];
};

export type FeatureFlagStatusEvent = {
  flag: keyof FeatureFlags;
  status: FeatureFlagStatus;
};
