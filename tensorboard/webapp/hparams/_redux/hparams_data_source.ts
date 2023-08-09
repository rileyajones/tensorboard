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
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {
  Domain,
  DomainType,
  BackendListSessionGroupRequest,
  BackendHparamsExperimentResponse,
  BackendHparamSpec,
  DiscreteDomainHparamSpec,
  SessionGroup,
  HparamAndMetricSpec,
  IntervalDomainHparamSpec,
  BackendListSessionGroupResponse,
  RunStatus,
} from '../types';
import {TBHttpClient} from '../../webapp_data_source/tb_http_client';

const HPARAMS_HTTP_PATH_PREFIX = 'data/plugin/hparams';

function isHparamDiscrete(
  hparam: BackendHparamSpec
): hparam is DiscreteDomainHparamSpec {
  return Boolean((hparam as DiscreteDomainHparamSpec).domainDiscrete);
}

function isHparamInterval(
  hparam: BackendHparamSpec
): hparam is IntervalDomainHparamSpec {
  return Boolean((hparam as IntervalDomainHparamSpec).domainInterval);
}

function getHparamDomain(hparam: BackendHparamSpec): Domain {
  if (isHparamDiscrete(hparam)) {
    return {
      type: DomainType.DISCRETE,
      values: hparam.domainDiscrete,
    };
  }

  if (isHparamInterval(hparam)) {
    return {
      ...hparam.domainInterval,
      type: DomainType.INTERVAL,
    };
  }

  return {
    values: [],
    type: DomainType.DISCRETE,
  };
}

@Injectable()
export class HparamsDataSource {
  constructor(private readonly http: TBHttpClient) {}

  private getPrefix(experimentIds: string[]) {
    return experimentIds.length > 1 ? 'compare' : 'experiment';
  }

  private formatExperimentIds(experimentIds: string[]) {
    if (experimentIds.length === 1) {
      return experimentIds[0];
    }

    return experimentIds.map((eid) => `${eid}:${eid}`).join(',');
  }

  fetchExperimentInfo(
    experimentIds: string[]
  ): Observable<HparamAndMetricSpec> {
    const formattedExperimentIds = this.formatExperimentIds(experimentIds);
    return this.http
      .post<BackendHparamsExperimentResponse>(
        `/${this.getPrefix(
          experimentIds
        )}/${formattedExperimentIds}/${HPARAMS_HTTP_PATH_PREFIX}/experiment`,
        {experimentName: formattedExperimentIds},
        {},
        'request'
      )
      .pipe(
        map((response) => {
          return {
            hparams: response.hparamInfos.map((hparam) => {
              const feHparam = {
                ...hparam,
                domain: getHparamDomain(hparam),
              };

              delete (feHparam as any).domainInterval;
              delete (feHparam as any).domainDiscrete;

              return feHparam;
            }),
            metrics: response.metricInfos.map((metric) => ({
              ...metric,
              tag: metric.name.tag,
            })),
          };
        })
      );
  }

  fetchSessionGroups(
    experimentIds: string[],
    hparamsAndMetricsSpecs: HparamAndMetricSpec
  ): Observable<SessionGroup[]> {
    const formattedExperimentIds = this.formatExperimentIds(experimentIds);

    const colParams: BackendListSessionGroupRequest['colParams'] = [];

    for (const hparam of hparamsAndMetricsSpecs.hparams) {
      colParams.push({hparam: hparam.name});
    }
    for (const mectric of hparamsAndMetricsSpecs.metrics) {
      colParams.push({
        metric: mectric.name,
      });
    }

    const listSessionRequestParams: BackendListSessionGroupRequest = {
      experimentName: formattedExperimentIds,
      allowedStatuses: [
        RunStatus.STATUS_FAILURE,
        RunStatus.STATUS_RUNNING,
        RunStatus.STATUS_SUCCESS,
        RunStatus.STATUS_UNKNOWN,
      ],
      colParams,
      startIndex: 0,
      // arbitrary large number so it does not get clipped.
      sliceSize: 1e6,
    };

    return this.http
      .post<BackendListSessionGroupResponse>(
        `/${this.getPrefix(
          experimentIds
        )}/${formattedExperimentIds}/${HPARAMS_HTTP_PATH_PREFIX}/session_groups`,
        listSessionRequestParams,
        {},
        'request'
      )
      .pipe(
        map((response) =>
          response.sessionGroups.map((sessionGroup) => {
            sessionGroup.sessions = sessionGroup.sessions.map((session) => {
              /**
               * In single experiment mode the Session.name is equal to the runName.
               * In comparison view it is `[AliasNumber] ExperimentAlias/runName`
               *
               * We store runs as experimentId/runName so it is necessary to prepend the experiment name
               * in single experiment view. In comparison view we pass the experimentId as the alias allowing
               * us to simply cut off the `[AliasNumber]` portion of the string
               */
              if (experimentIds.length > 1) {
                const [, ...runName] = session.name.split(' ');
                session.name = runName.join(' ');
              } else {
                session.name = [experimentIds[0], session.name].join('/');
              }
              return session;
            });
            return sessionGroup;
          })
        )
      );
  }
}
