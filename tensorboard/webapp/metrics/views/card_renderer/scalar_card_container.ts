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
import {
  BehaviorSubject,
  combineLatest,
  from,
  Observable,
  of,
  Subject,
} from 'rxjs';
import {
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  takeUntil,
} from 'rxjs/operators';
import {State} from '../../../app_state';
import {ExperimentAlias} from '../../../experiments/types';
import {getForceSvgFeatureFlag} from '../../../feature_flag/store/feature_flag_selectors';
import {
  getCardPinnedState,
  getCurrentRouteRunSelection,
  getDarkModeEnabled,
  getExperimentIdForRunId,
  getExperimentIdToExperimentAliasMap,
  getMetricsLinkedTimeEnabled,
  getMetricsLinkedTimeSelection,
  getMetricsStepSelectorEnabled,
  getRun,
  getRunColorMap,
} from '../../../selectors';
import {DataLoadState} from '../../../types/data';
import {
  TimeSelection,
  TimeSelectionToggleAffordance,
  TimeSelectionWithAffordance,
} from '../../../widgets/card_fob/card_fob_types';
import {classicSmoothing} from '../../../widgets/line_chart_v2/data_transformer';
import {Extent} from '../../../widgets/line_chart_v2/lib/public_types';
import {ScaleType} from '../../../widgets/line_chart_v2/types';
import {stepSelectorToggled, timeSelectionChanged} from '../../actions';
import {PluginType, ScalarStepDatum} from '../../data_source';
import {
  getCardLoadState,
  getCardMetadata,
  getCardTimeSeries,
  getMetricsIgnoreOutliers,
  getMetricsScalarPartitionNonMonotonicX,
  getMetricsScalarSmoothing,
  getMetricsTooltipSort,
  getMetricsXAxisType,
  RunToSeries,
} from '../../store';
import {CardId, CardMetadata, XAxisType} from '../../types';
import {CardRenderer} from '../metrics_view_types';
import {getTagDisplayName} from '../utils';
import {DataDownloadDialogContainer} from './data_download_dialog_container';
import {
  ColumnHeaders,
  MinMaxStep,
  PartialSeries,
  PartitionedSeries,
  ScalarCardDataSeries,
  ScalarCardPoint,
  ScalarCardSeriesMetadataMap,
  SeriesType,
} from './scalar_card_types';
import {
  maybeClipLinkedTimeSelection,
  partitionSeries,
  TimeSelectionView,
} from './utils';

type ScalarCardMetadata = CardMetadata & {
  plugin: PluginType.SCALARS;
};

function areSeriesEqual(
  listA: PartialSeries[],
  listB: PartialSeries[]
): boolean {
  if (listA.length !== listB.length) {
    return false;
  }
  return listA.every((listAVal, index) => {
    const listBVal = listB[index];
    const listAPoints = listAVal.points;
    const listBPoints = listBVal.points;
    return (
      listAVal.runId === listBVal.runId &&
      listAPoints.length === listBPoints.length &&
      listAPoints.every((listAPoint, index) => {
        const listBPoint = listBPoints[index];
        return listAPoint.x === listBPoint.x && listAPoint.y === listBPoint.y;
      })
    );
  });
}

const DEFAULT_ZOOM: MinMaxStep = Object.freeze({
  minStep: -Infinity,
  maxStep: Infinity,
});
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
      [showFullSize]="showFullSize"
      [smoothingEnabled]="smoothingEnabled$ | async"
      [tag]="tag$ | async"
      [title]="title$ | async"
      [tooltipSort]="tooltipSort$ | async"
      [xAxisType]="xAxisType$ | async"
      [xScaleType]="xScaleType$ | async"
      [useDarkMode]="useDarkMode$ | async"
      [linkedTimeSelection]="linkedTimeSelection$ | async"
      [stepSelectorTimeSelection]="stepSelectorTimeSelection$ | async"
      [forceSvg]="forceSvg$ | async"
      [minMaxStep]="minMaxSteps$ | async"
      [dataHeaders]="columnHeaders$ | async"
      (onFullSizeToggle)="onFullSizeToggle()"
      (onPinClicked)="pinStateChanged.emit($event)"
      observeIntersection
      (onVisibilityChange)="onVisibilityChange($event)"
      (onTimeSelectionChanged)="onTimeSelectionChanged($event)"
      (onStepSelectorToggled)="onStepSelectorToggled($event)"
      (onLineChartZoom)="onLineChartZoom($event)"
      (onLineChartReset)="onLineChartReset()"
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
  @Output() fullWidthChanged = new EventEmitter<boolean>();
  @Output() fullHeightChanged = new EventEmitter<boolean>();
  @Output() pinStateChanged = new EventEmitter<boolean>();

  isVisible: boolean = false;
  loadState$?: Observable<DataLoadState>;
  title$?: Observable<string>;
  tag$?: Observable<string>;
  isPinned$?: Observable<boolean>;
  dataSeries$?: Observable<ScalarCardDataSeries[]>;
  chartMetadataMap$?: Observable<ScalarCardSeriesMetadataMap>;
  stepSelectorTimeSelection$?: Observable<TimeSelection | null>;
  minMaxSteps$?: Observable<MinMaxStep>;
  columnHeaders$?: Observable<ColumnHeaders[]>;

  lineChartZoom$ = new BehaviorSubject<MinMaxStep>(DEFAULT_ZOOM);

  onVisibilityChange({visible}: {visible: boolean}) {
    this.isVisible = visible;
  }

  readonly linkedTimeSelection$ = new BehaviorSubject<TimeSelectionView | null>(
    null
  );
  readonly useDarkMode$ = this.store.select(getDarkModeEnabled);
  readonly ignoreOutliers$ = this.store.select(getMetricsIgnoreOutliers);
  readonly tooltipSort$ = this.store.select(getMetricsTooltipSort);
  readonly xAxisType$ = this.store.select(getMetricsXAxisType);
  readonly forceSvg$ = this.store.select(getForceSvgFeatureFlag);
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

  showFullSize = false;

  private readonly ngUnsubscribe = new Subject<void>();

  private isScalarCardMetadata(
    cardMetadata: CardMetadata
  ): cardMetadata is ScalarCardMetadata {
    const {plugin} = cardMetadata;
    return plugin === PluginType.SCALARS;
  }

  onFullSizeToggle() {
    this.showFullSize = !this.showFullSize;
    this.fullWidthChanged.emit(this.showFullSize);
    this.fullHeightChanged.emit(this.showFullSize);
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

    const nonNullRunsToScalarSeries$ = this.store
      .select(getCardTimeSeries, this.cardId)
      .pipe(
        takeUntil(this.ngUnsubscribe),
        filter((runToSeries) => Boolean(runToSeries)),
        map((runToSeries) => runToSeries as RunToSeries<PluginType.SCALARS>),
        shareReplay(1)
      );

    const partialSeries$ = nonNullRunsToScalarSeries$.pipe(
      combineLatestWith(this.store.select(getMetricsXAxisType)),
      map(([runToSeries, xAxisType]) => {
        const runIds = Object.keys(runToSeries);
        const results = runIds.map((runId) => {
          return {
            runId,
            points: this.stepSeriesToLineSeries(runToSeries[runId], xAxisType),
          };
        });
        return results;
      }),
      distinctUntilChanged(areSeriesEqual)
    );

    function getSmoothedSeriesId(seriesId: string): string {
      return JSON.stringify(['smoothed', seriesId]);
    }

    const partitionedSeries$ = partialSeries$.pipe(
      combineLatestWith(
        this.store.select(getMetricsScalarPartitionNonMonotonicX)
      ),
      takeUntil(this.ngUnsubscribe),
      map<[PartialSeries[], boolean], PartitionedSeries[]>(
        ([normalizedSeries, enablePartition]) => {
          if (enablePartition) return partitionSeries(normalizedSeries);

          return normalizedSeries.map((series) => {
            return {
              ...series,
              seriesId: series.runId,
              partitionIndex: 0,
              partitionSize: 1,
            };
          });
        }
      ),
      map((partitionedSeriesList) => {
        return partitionedSeriesList.map((partitionedSeries) => {
          const firstWallTime = partitionedSeries.points[0]?.wallTime;
          return {
            ...partitionedSeries,
            points: partitionedSeries.points.map((point) => {
              return {
                ...point,
                relativeTimeInMs: point.wallTime - firstWallTime,
              };
            }),
          };
        });
      }),
      combineLatestWith(this.store.select(getMetricsXAxisType)),
      map(([partitionedSeriesList, xAxisType]) => {
        return partitionedSeriesList.map((series) => {
          return {
            ...series,
            points: series.points.map((point) => {
              let x: number;
              switch (xAxisType) {
                case XAxisType.RELATIVE:
                  x = point.relativeTimeInMs;
                  break;
                case XAxisType.WALL_TIME:
                  x = point.wallTime;
                  break;
                case XAxisType.STEP:
                default:
                  x = point.step;
              }
              return {...point, x};
            }),
          };
        });
      }),
      shareReplay(1)
    );

    const minMaxStepsInSeries$ = partitionedSeries$.pipe(
      map((series) => {
        const allPoints = series
          .map(({points}) => points.map(({x}) => x))
          .flat();
        const minStep = Math.min(...allPoints);
        const maxStep = Math.max(...allPoints);

        return {minStep, maxStep};
      })
    );

    this.minMaxSteps$ = combineLatest([
      minMaxStepsInSeries$,
      this.lineChartZoom$,
    ]).pipe(
      map(([seriesMinMax, viewPort]) => {
        const minStep = Math.max(seriesMinMax.minStep, viewPort.minStep);
        const maxStep = Math.min(seriesMinMax.maxStep, viewPort.maxStep);

        return {minStep, maxStep};
      })
    );

    this.dataSeries$ = partitionedSeries$.pipe(
      // Smooth
      combineLatestWith(this.store.select(getMetricsScalarSmoothing)),
      switchMap<
        [PartitionedSeries[], number],
        Observable<ScalarCardDataSeries[]>
      >(([runsData, smoothing]) => {
        const cleanedRunsData = runsData.map(({seriesId, points}) => ({
          id: seriesId,
          points,
        }));
        if (smoothing <= 0) {
          return of(cleanedRunsData);
        }

        return from(classicSmoothing(cleanedRunsData, smoothing)).pipe(
          map((smoothedDataSeriesList) => {
            const smoothedList = cleanedRunsData.map((dataSeries, index) => {
              return {
                id: getSmoothedSeriesId(dataSeries.id),
                points: smoothedDataSeriesList[index].points.map(
                  ({y}, pointIndex) => {
                    return {...dataSeries.points[pointIndex], y};
                  }
                ),
              };
            });
            return [...cleanedRunsData, ...smoothedList];
          })
        );
      }),
      startWith([] as ScalarCardDataSeries[])
    );

    combineLatest([
      this.minMaxSteps$,
      this.store.select(getMetricsLinkedTimeEnabled),
      this.store.select(getMetricsLinkedTimeSelection),
      this.store.select(getMetricsXAxisType),
    ]).subscribe(
      ([{minStep, maxStep}, linkedTimeEnabled, timeSelection, xAxisType]) => {
        if (
          !linkedTimeEnabled ||
          xAxisType !== XAxisType.STEP ||
          !timeSelection
        ) {
          this.linkedTimeSelection$.next(null);
          return;
        }

        const potentiallyClippedTimeSelection = maybeClipLinkedTimeSelection(
          timeSelection,
          minStep,
          maxStep
        );

        const zoomedViewBox = this.lineChartZoom$.getValue();
        const isViewBoxDefault =
          zoomedViewBox.minStep === DEFAULT_ZOOM.minStep &&
          zoomedViewBox.maxStep === DEFAULT_ZOOM.maxStep;
        // If zoom has changed, the clipped status should not be changed.
        if (!isViewBoxDefault) {
          potentiallyClippedTimeSelection.clipped =
            this.linkedTimeSelection$.getValue()?.clipped ?? false;
        }
        console.log(potentiallyClippedTimeSelection);

        this.linkedTimeSelection$.next(potentiallyClippedTimeSelection);
      }
    );

    this.columnHeaders$ = combineLatest([
      this.smoothingEnabled$,
      this.linkedTimeSelection$,
    ]).pipe(
      map(([smoothingEnabled, timeSelection]) => {
        const headers: ColumnHeaders[] = [];
        if (timeSelection === null || timeSelection.endStep === null) {
          // Single Step Selected
          headers.push(ColumnHeaders.RUN);
          if (smoothingEnabled) {
            headers.push(ColumnHeaders.SMOOTHED);
          }
          headers.push(ColumnHeaders.VALUE);
          headers.push(ColumnHeaders.STEP);
          headers.push(ColumnHeaders.RELATIVE_TIME);
        } else {
          // Range selection headers.
          headers.push(ColumnHeaders.RUN);
          headers.push(ColumnHeaders.MIN_VALUE);
          headers.push(ColumnHeaders.MAX_VALUE);
          headers.push(ColumnHeaders.START_VALUE);
          headers.push(ColumnHeaders.END_VALUE);
          headers.push(ColumnHeaders.VALUE_CHANGE);
          headers.push(ColumnHeaders.PERCENTAGE_CHANGE);
          headers.push(ColumnHeaders.START_STEP);
          headers.push(ColumnHeaders.END_STEP);
        }
        return headers;
      })
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
        this.store.select(getRunColorMap),
        this.store.select(getMetricsScalarSmoothing)
      ),
      // When the `fetchRunsSucceeded` action fires, the run selection
      // map and the metadata change. To prevent quick fire of changes,
      // debounce by a microtask to emit only single change for the runs
      // store change.
      debounceTime(0),
      map(([namedPartitionedSeries, runSelectionMap, colorMap, smoothing]) => {
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
            visible: Boolean(runSelectionMap && runSelectionMap.get(runId)),
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
      }),
      startWith({} as ScalarCardSeriesMetadataMap)
    );

    this.loadState$ = this.store.select(getCardLoadState, this.cardId);

    this.tag$ = cardMetadata$.pipe(
      map((cardMetadata) => {
        return cardMetadata.tag;
      })
    );

    this.title$ = this.tag$.pipe(
      map((tag) => {
        return getTagDisplayName(tag, this.groupName);
      })
    );

    this.isPinned$ = this.store.select(getCardPinnedState, this.cardId);

    this.stepSelectorTimeSelection$ = combineLatest([
      this.minMaxSteps$,
      this.store.select(getMetricsStepSelectorEnabled),
    ]).pipe(
      map(([{minStep}, enableStepSelector]) => {
        return enableStepSelector ? {start: {step: minStep}, end: null} : null;
      })
    );
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

  private stepSeriesToLineSeries(
    stepSeries: ScalarStepDatum[],
    xAxisType: XAxisType
  ): ScalarCardPoint[] {
    const isStepBased = xAxisType === XAxisType.STEP;
    return stepSeries.map((stepDatum) => {
      // Normalize data and convert wallTime in seconds to milliseconds.
      // TODO(stephanwlee): when the legacy line chart is removed, do the conversion
      // at the effects.
      const wallTime = stepDatum.wallTime * 1000;
      return {
        ...stepDatum,
        x: isStepBased ? stepDatum.step : wallTime,
        y: stepDatum.value,
        wallTime,
        // Put a fake relative time so we can work around with types too much.
        // The real value would be set after we partition the timeseries so
        // we can have a relative time per partition.
        relativeTimeInMs: 0,
      };
    });
  }

  onTimeSelectionChanged(
    newTimeSelectionWithAffordance: TimeSelectionWithAffordance
  ) {
    this.store.dispatch(timeSelectionChanged(newTimeSelectionWithAffordance));
  }

  onStepSelectorToggled(affordance: TimeSelectionToggleAffordance) {
    this.store.dispatch(stepSelectorToggled({affordance}));
  }

  onLineChartReset() {
    this.lineChartZoom$.next(DEFAULT_ZOOM);
  }

  onLineChartZoom(lineChartViewBox: Extent) {
    const minMax = lineChartViewBox.x;
    const minMaxStepInViewPort: MinMaxStep = {
      minStep: Math.ceil(Math.min(...minMax)),
      maxStep: Math.floor(Math.max(...minMax)),
    };
    this.lineChartZoom$.next(minMaxStepInViewPort);
  }
}
