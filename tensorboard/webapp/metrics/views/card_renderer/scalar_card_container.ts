/* Copyright 2020 The TensorFlow Authors. All Rights Reserved.

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
import {ComponentType} from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import {Store} from '@ngrx/store';
import {combineLatest, Observable, Subject} from 'rxjs';
import {
  combineLatestWith,
  debounceTime,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs/operators';
import {State} from '../../../app_state';
import {ExperimentAlias} from '../../../experiments/types';
import {
  getEnableHparamsInTimeSeries,
  getForceSvgFeatureFlag,
  getIsScalarColumnCustomizationEnabled,
} from '../../../feature_flag/store/feature_flag_selectors';
import {
  getCardPinnedState,
  getCardStateMap,
  getDarkModeEnabled,
  getExperimentIdForRunId,
  getExperimentIdToExperimentAliasMap,
  getMetricsCardDataMinMax,
  getMetricsCardTimeSelection,
  getMetricsCardUserViewBox,
  getMetricsLinkedTimeEnabled,
  getMetricsLinkedTimeSelection,
  getMetricsCardRangeSelectionEnabled,
  getRun,
  getRunColorMap,
  getCurrentRouteRunSelection,
  getColumnHeadersForCard,
  getScalarPartitionedSeries,
  getScalarCardDataSeries,
} from '../../../selectors';
import {DataLoadState} from '../../../types/data';
import {
  TimeSelection,
  TimeSelectionToggleAffordance,
  TimeSelectionWithAffordance,
} from '../../../widgets/card_fob/card_fob_types';
import {Extent} from '../../../widgets/line_chart_v2/lib/public_types';
import {ScaleType} from '../../../widgets/line_chart_v2/types';
import {
  cardViewBoxChanged,
  dataTableColumnEdited,
  dataTableColumnToggled,
  metricsCardFullSizeToggled,
  metricsCardStateUpdated,
  sortingDataTable,
  stepSelectorToggled,
  timeSelectionChanged,
  metricsSlideoutMenuOpened,
} from '../../actions';
import {PluginType, ScalarStepDatum} from '../../data_source';
import {
  CardState,
  getCardLoadState,
  getCardMetadata,
  getMetricsCardMinMax,
  getMetricsIgnoreOutliers,
  getMetricsScalarSmoothing,
  getMetricsTooltipSort,
  getMetricsXAxisType,
} from '../../store';
import {CardId, CardMetadata, HeaderEditInfo, XAxisType} from '../../types';
import {getFilteredRenderableRunsIdsFromRoute} from '../main_view/common_selectors';
import {CardRenderer} from '../metrics_view_types';
import {getTagDisplayName} from '../utils';
import {DataDownloadDialogContainer} from './data_download_dialog_container';
import {
  MinMaxStep,
  PartialSeries,
  PartitionedSeries,
  ScalarCardDataSeries,
  ScalarCardPoint,
  ScalarCardSeriesMetadataMap,
  SeriesType,
} from './scalar_card_types';
import {
  ColumnHeader,
  DataTableMode,
  SortingInfo,
} from '../../../widgets/data_table/types';
import {maybeClipTimeSelectionView, TimeSelectionView} from './utils';

type ScalarCardMetadata = CardMetadata & {
  plugin: PluginType.SCALARS;
};

@Component({
  selector: 'scalar-card',
  template: `
    <scalar-card-component
      [cardId]="cardId"
      [chartMetadataMap]="chartMetadataMap$ | async"
      [DataDownloadComponent]="DataDownloadComponent"
      [dataSeries]="dataSeries$ | async"
      [ignoreOutliers]="ignoreOutliers$ | async"
      [isCardVisible]="isVisible"
      [isPinned]="isPinned$ | async"
      [loadState]="loadState$ | async"
      [showFullWidth]="showFullWidth$ | async"
      [smoothingEnabled]="smoothingEnabled$ | async"
      [tag]="tag$ | async"
      [title]="title$ | async"
      [cardState]="cardState$ | async"
      [tooltipSort]="tooltipSort$ | async"
      [xAxisType]="xAxisType$ | async"
      [xScaleType]="xScaleType$ | async"
      [useDarkMode]="useDarkMode$ | async"
      [linkedTimeSelection]="linkedTimeSelection$ | async"
      [stepOrLinkedTimeSelection]="stepOrLinkedTimeSelection$ | async"
      [forceSvg]="forceSvg$ | async"
      [columnCustomizationEnabled]="columnCustomizationEnabled$ | async"
      [minMaxStep]="minMaxSteps$ | async"
      [userViewBox]="userViewBox$ | async"
      [columnHeaders]="columnHeaders$ | async"
      [rangeEnabled]="rangeEnabled$ | async"
      [hparamsEnabled]="hparamsEnabled$ | async"
      (onFullSizeToggle)="onFullSizeToggle()"
      (onPinClicked)="pinStateChanged.emit($event)"
      observeIntersection
      (onVisibilityChange)="onVisibilityChange($event)"
      (onTimeSelectionChanged)="onTimeSelectionChanged($event)"
      (onStepSelectorToggled)="onStepSelectorToggled($event)"
      (onDataTableSorting)="onDataTableSorting($event)"
      (onLineChartZoom)="onLineChartZoom($event)"
      (editColumnHeaders)="editColumnHeaders($event)"
      (onCardStateChanged)="onCardStateChanged($event)"
      (openTableEditMenuToMode)="openTableEditMenuToMode($event)"
      (removeColumn)="onRemoveColumn($event)"
    ></scalar-card-component>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScalarCardContainer implements CardRenderer, OnInit, OnDestroy {
  constructor(private readonly store: Store<State>) {}

  // Angular Component constructor for DataDownload dialog. It is customizable for
  // testability, without mocking out data for the component's internals, but defaults to
  // the DataDownloadDialogContainer.
  @Input() DataDownloadComponent: ComponentType<any> =
    DataDownloadDialogContainer;
  @Input() cardId!: CardId;
  @Input() groupName!: string | null;
  @Output() pinStateChanged = new EventEmitter<boolean>();

  isVisible: boolean = false;
  loadState$?: Observable<DataLoadState>;
  title$?: Observable<string>;
  tag$?: Observable<string>;
  isPinned$?: Observable<boolean>;
  dataSeries$?: Observable<ScalarCardDataSeries[]>;
  chartMetadataMap$?: Observable<ScalarCardSeriesMetadataMap>;
  linkedTimeSelection$?: Observable<TimeSelectionView | null>;
  columnHeaders$?: Observable<ColumnHeader[]>;
  minMaxSteps$?: Observable<MinMaxStep | undefined>;
  userViewBox$?: Observable<Extent | null>;
  stepOrLinkedTimeSelection$?: Observable<TimeSelection | undefined>;
  cardState$?: Observable<Partial<CardState>>;
  rangeEnabled$?: Observable<boolean>;
  hparamsEnabled$?: Observable<boolean>;

  onVisibilityChange({visible}: {visible: boolean}) {
    this.isVisible = visible;
  }

  readonly useDarkMode$ = this.store.select(getDarkModeEnabled);
  readonly ignoreOutliers$ = this.store.select(getMetricsIgnoreOutliers);
  readonly tooltipSort$ = this.store.select(getMetricsTooltipSort);
  readonly xAxisType$ = this.store.select(getMetricsXAxisType);
  readonly forceSvg$ = this.store.select(getForceSvgFeatureFlag);
  readonly columnCustomizationEnabled$ = this.store.select(
    getIsScalarColumnCustomizationEnabled
  );
  readonly xScaleType$ = this.store.select(getMetricsXAxisType).pipe(
    map((xAxisType) => {
      switch (xAxisType) {
        case XAxisType.STEP:
        case XAxisType.RELATIVE:
          return ScaleType.LINEAR;
        case XAxisType.WALL_TIME:
          return ScaleType.TIME;
        default:
          const neverType = xAxisType as never;
          throw new Error(`Invalid xAxisType for line chart. ${neverType}`);
      }
    })
  );

  readonly scalarSmoothing$ = this.store.select(getMetricsScalarSmoothing);
  readonly smoothingEnabled$ = this.store
    .select(getMetricsScalarSmoothing)
    .pipe(map((smoothing) => smoothing > 0));

  readonly showFullWidth$ = this.store
    .select(getCardStateMap)
    .pipe(map((map) => map[this.cardId]?.fullWidth));

  private readonly ngUnsubscribe = new Subject<void>();

  private isScalarCardMetadata(
    cardMetadata: CardMetadata
  ): cardMetadata is ScalarCardMetadata {
    const {plugin} = cardMetadata;
    return plugin === PluginType.SCALARS;
  }

  onFullSizeToggle() {
    this.store.dispatch(metricsCardFullSizeToggled({cardId: this.cardId}));
  }

  /**
   * Build observables once cardId is defined (after onInit).
   */
  ngOnInit() {
    const selectCardMetadata$ = this.store.select(getCardMetadata, this.cardId);
    const cardMetadata$ = selectCardMetadata$.pipe(
      filter((cardMetadata) => {
        return !!cardMetadata && this.isScalarCardMetadata(cardMetadata);
      }),
      map((cardMetadata) => {
        return cardMetadata as ScalarCardMetadata;
      })
    );

    function getSmoothedSeriesId(seriesId: string): string {
      return JSON.stringify(['smoothed', seriesId]);
    }

    const partitionedSeries$ = this.store
      .select(getScalarPartitionedSeries(this.cardId))
      .pipe(filter(Boolean), shareReplay(1));

    this.userViewBox$ = this.store.select(
      getMetricsCardUserViewBox,
      this.cardId
    );

    this.minMaxSteps$ = combineLatest([
      this.store.select(getMetricsCardMinMax, this.cardId),
      this.store.select(getMetricsCardDataMinMax, this.cardId),
    ]).pipe(
      map(([minMax, dataMinMax]) => {
        if (!minMax || !dataMinMax) {
          return;
        }
        return {
          minStep: Math.max(minMax?.minStep!, dataMinMax?.minStep!),
          maxStep: Math.min(minMax?.maxStep!, dataMinMax?.maxStep!),
        };
      })
    );

    this.dataSeries$ = this.store
      .select(getScalarCardDataSeries(this.cardId))
      .pipe(filter(Boolean), startWith([] as ScalarCardDataSeries[]));

    this.linkedTimeSelection$ = combineLatest([
      this.minMaxSteps$,
      this.store.select(getMetricsLinkedTimeEnabled),
      this.store.select(getMetricsLinkedTimeSelection),
      this.store.select(getMetricsXAxisType),
    ]).pipe(
      map(([minMax, linkedTimeEnabled, timeSelection, xAxisType]) => {
        if (
          !minMax ||
          !linkedTimeEnabled ||
          xAxisType !== XAxisType.STEP ||
          !timeSelection
        ) {
          return null;
        }

        return maybeClipTimeSelectionView(
          timeSelection,
          minMax.minStep,
          minMax.maxStep
        );
      })
    );

    this.stepOrLinkedTimeSelection$ = this.store.select(
      getMetricsCardTimeSelection,
      this.cardId
    );

    this.columnHeaders$ = this.store.select(
      getColumnHeadersForCard(this.cardId)
    );

    this.chartMetadataMap$ = partitionedSeries$.pipe(
      switchMap<
        PartitionedSeries[],
        Observable<
          Array<
            PartitionedSeries & {
              displayName: string;
              alias: ExperimentAlias | null;
            }
          >
        >
      >((partitioned) => {
        return combineLatest(
          partitioned.map((series) => {
            return this.getRunDisplayNameAndAlias(series.runId).pipe(
              map((displayNameAndAlias) => {
                return {...series, ...displayNameAndAlias};
              })
            );
          })
        );
      }),
      combineLatestWith(
        this.store.select(getCurrentRouteRunSelection),
        this.store.select(getEnableHparamsInTimeSeries),
        this.store.select(getFilteredRenderableRunsIdsFromRoute),
        this.store.select(getRunColorMap),
        this.store.select(getMetricsScalarSmoothing)
      ),
      // When the `fetchRunsSucceeded` action fires, the run selection
      // map and the metadata change. To prevent quick fire of changes,
      // debounce by a microtask to emit only single change for the runs
      // store change.
      debounceTime(0),
      map(
        ([
          namedPartitionedSeries,
          runSelectionMap,
          hparamsInTimeSeriesEnabled,
          renderableRuns,
          colorMap,
          smoothing,
        ]) => {
          const metadataMap: ScalarCardSeriesMetadataMap = {};
          const shouldSmooth = smoothing > 0;

          for (const partitioned of namedPartitionedSeries) {
            const {
              seriesId,
              runId,
              displayName,
              alias,
              partitionIndex,
              partitionSize,
            } = partitioned;

            metadataMap[seriesId] = {
              type: SeriesType.ORIGINAL,
              id: seriesId,
              alias,
              displayName:
                partitionSize > 1
                  ? `${displayName}: ${partitionIndex}`
                  : displayName,
              visible: Boolean(
                runSelectionMap &&
                  runSelectionMap.get(runId) &&
                  (!hparamsInTimeSeriesEnabled || renderableRuns.has(runId))
              ),
              color: colorMap[runId] ?? '#fff',
              aux: false,
              opacity: 1,
            };
          }

          if (!shouldSmooth) {
            return metadataMap;
          }

          for (const [id, metadata] of Object.entries(metadataMap)) {
            const smoothedSeriesId = getSmoothedSeriesId(id);
            metadataMap[smoothedSeriesId] = {
              ...metadata,
              id: smoothedSeriesId,
              type: SeriesType.DERIVED,
              aux: false,
              originalSeriesId: id,
            };

            metadata.aux = true;
            metadata.opacity = 0.25;
          }

          return metadataMap;
        }
      ),
      startWith({} as ScalarCardSeriesMetadataMap)
    );

    this.loadState$ = this.store.select(getCardLoadState, this.cardId);

    this.tag$ = cardMetadata$.pipe(
      map((cardMetadata) => {
        return cardMetadata.tag;
      })
    );

    this.cardState$ = this.store.select(getCardStateMap).pipe(
      map((cardStateMap) => {
        return cardStateMap[this.cardId] || {};
      })
    );

    this.title$ = this.tag$.pipe(
      map((tag) => {
        return getTagDisplayName(tag, this.groupName);
      })
    );

    this.isPinned$ = this.store.select(getCardPinnedState, this.cardId);

    this.rangeEnabled$ = this.store.select(
      getMetricsCardRangeSelectionEnabled,
      this.cardId
    );

    this.hparamsEnabled$ = this.store.select(getEnableHparamsInTimeSeries);
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  private getRunDisplayNameAndAlias(
    runId: string
  ): Observable<{displayName: string; alias: ExperimentAlias | null}> {
    return combineLatest([
      this.store.select(getExperimentIdForRunId, {runId}),
      this.store.select(getExperimentIdToExperimentAliasMap),
      this.store.select(getRun, {runId}),
    ]).pipe(
      map(([experimentId, idToAlias, run]) => {
        const alias =
          experimentId !== null ? idToAlias[experimentId] ?? null : null;
        return {
          displayName: !run && !alias ? runId : run?.name ?? '...',
          alias: alias,
        };
      })
    );
  }

  onDataTableSorting(sortingInfo: SortingInfo) {
    this.store.dispatch(sortingDataTable(sortingInfo));
  }

  onCardStateChanged(newSettings: Partial<CardState>) {
    this.store.dispatch(
      metricsCardStateUpdated({
        cardId: this.cardId,
        settings: newSettings,
      })
    );
  }

  onTimeSelectionChanged(
    newTimeSelectionWithAffordance: TimeSelectionWithAffordance
  ) {
    this.store.dispatch(
      timeSelectionChanged({
        ...newTimeSelectionWithAffordance,
        cardId: this.cardId,
      })
    );
  }

  onStepSelectorToggled(affordance: TimeSelectionToggleAffordance) {
    this.store.dispatch(stepSelectorToggled({affordance, cardId: this.cardId}));
  }

  onLineChartZoom(lineChartViewBox: Extent | null) {
    this.store.dispatch(
      cardViewBoxChanged({
        userViewBox: lineChartViewBox,
        cardId: this.cardId,
      })
    );
  }

  editColumnHeaders(headerEditInfo: HeaderEditInfo) {
    this.store.dispatch(dataTableColumnEdited(headerEditInfo));
  }

  openTableEditMenuToMode(tableMode: DataTableMode) {
    this.store.dispatch(metricsSlideoutMenuOpened({mode: tableMode}));
  }

  onRemoveColumn(header: ColumnHeader) {
    this.store.dispatch(dataTableColumnToggled({header, cardId: this.cardId}));
  }
}
