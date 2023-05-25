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
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {createSelector, Store} from '@ngrx/store';
import {BehaviorSubject, combineLatest, Observable, of, Subject} from 'rxjs';
import {
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  takeUntil,
} from 'rxjs/operators';
import * as alertActions from '../../../alert/actions';
import {areSameRouteKindAndExperiments} from '../../../app_routing';
import {State} from '../../../app_state';
import {ExperimentAlias} from '../../../experiments/types';
import {
  actions as hparamsActions,
  selectors as hparamsSelectors,
} from '../../../hparams';
import {
  DiscreteFilter,
  DiscreteHparamValue,
  DiscreteHparamValues,
  DomainType,
  IntervalFilter,
} from '../../../hparams/types';
import {
  getActiveRoute,
  getCurrentRouteRunSelection,
  getExperiment,
  getExperimentIdToExperimentAliasMap,
  getRunColorMap,
  getRuns,
  getRunSelectorPaginationOption,
  getRunSelectorRegexFilter,
  getRunSelectorSort,
  getRunsLoadState,
} from '../../../selectors';
import {DataLoadState, LoadState} from '../../../types/data';
import {SortDirection} from '../../../types/ui';
import {matchRunToRegex} from '../../../util/matcher';
import {getEnableHparamsInTimeSeries} from '../../../feature_flag/store/feature_flag_selectors';
import {
  ColumnHeaderType,
  SortingOrder,
  TableData,
} from '../../../widgets/data_table/types';
import {
  runColorChanged,
  runPageSelectionToggled,
  runSelectionToggled,
  runSelectorPaginationOptionChanged,
  runSelectorRegexFilterChanged,
  runSelectorSortChanged,
  runTableShown,
  singleRunSelected,
} from '../../actions';
import {MAX_NUM_RUNS_TO_ENABLE_BY_DEFAULT} from '../../store/runs_types';
import {SortKey, SortType} from '../../types';
import {
  HparamColumn,
  IntervalFilterChange,
  MetricColumn,
} from './runs_table_component';
import {RunsTableColumn, RunTableItem} from './types';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ColumnSelectorModal} from '../../../widgets/data_table/column_selector_modal';
import {ComponentType} from '@angular/cdk/overlay';
import {getPotentialHparamColumns} from '../../../metrics/views/main_view/common_selectors';

const getRunsLoading = createSelector<
  State,
  {experimentId: string},
  LoadState,
  boolean
>(getRunsLoadState, (loadState) => loadState.state === DataLoadState.LOADING);

function getPropsForSort(
  item: RunTableItem,
  key: SortKey
): Array<ExperimentAlias | string | number | boolean | undefined> {
  switch (key.type) {
    case SortType.EXPERIMENT_NAME:
      return [item.experimentAlias, item.run.name, item.run.id];
    case SortType.RUN_NAME:
      return [item.run.name, item.experimentAlias, item.run.id];
    case SortType.HPARAM:
      return [
        item.hparams.get(key.name),
        item.run.name,
        item.experimentAlias,
        item.run.id,
      ];
    case SortType.METRIC:
      return [
        item.metrics.get(key.tag),
        item.run.name,
        item.experimentAlias,
        item.run.id,
      ];
    default:
      const _ = key as never;
      throw new Error(`Not yet implemented: ${_}`);
  }
}

function sortRunTableItems(
  items: RunTableItem[],
  sort: {key: SortKey | null; direction: SortDirection}
): RunTableItem[] {
  const sortKey = sort.key;
  const sortedItems = [...items];
  if (sortKey === null || sort.direction === SortDirection.UNSET) {
    return sortedItems;
  }

  sortedItems.sort((a, b) => {
    const aProps = getPropsForSort(a, sortKey);
    const bProps = getPropsForSort(b, sortKey);
    if (aProps.length !== bProps.length) {
      throw new Error(
        'Invariant error: a given sort should result in same number of ' +
          `items: ${sort}`
      );
    }

    for (let index = 0; index < aProps.length; index++) {
      const valA = aProps[index];
      const valB = bProps[index];
      if (valA === valB) {
        continue;
      }

      if (valA === undefined || valB === undefined) {
        return valB === undefined ? -1 : 1;
      }

      if (typeof valA !== typeof valB) {
        throw new Error(
          `Cannot compare values of different types: ` +
            `${typeof valA} vs. ${typeof valB}`
        );
      }
      return valA < valB === (sort.direction === SortDirection.ASC) ? -1 : 1;
    }
    return 0;
  });
  return sortedItems;
}

function matchFilter(
  filter: DiscreteFilter | IntervalFilter,
  value: number | DiscreteHparamValue | undefined
): boolean {
  if (value === undefined) {
    return filter.includeUndefined;
  }
  if (filter.type === DomainType.DISCRETE) {
    // (upcast to work around bad TypeScript libdefs)
    const values: Readonly<Array<typeof filter.filterValues[number]>> =
      filter.filterValues;
    return values.includes(value);
  } else if (filter.type === DomainType.INTERVAL) {
    // Auto-added to unblock TS5.0 migration
    //  @ts-ignore(go/ts50upgrade): Operator '<=' cannot be applied to types
    //  'number' and 'string | number | boolean'.
    // Auto-added to unblock TS5.0 migration
    //  @ts-ignore(go/ts50upgrade): Operator '<=' cannot be applied to types
    //  'string | number | boolean' and 'number'.
    return filter.filterLowerValue <= value && value <= filter.filterUpperValue;
  }
  return false;
}

/**
 * Renders list of experiments.
 *
 * Note: all @Inputs are read once upon initialization. This component does not
 * update when input bindings change.
 */
@Component({
  selector: 'runs-table',
  template: `
    <runs-table-component
      *ngIf="!HParamsEnabled.value"
      [experimentIds]="experimentIds"
      [useFlexibleLayout]="useFlexibleLayout"
      [numSelectedItems]="numSelectedItems$ | async"
      [columns]="columns"
      [hparamColumns]="hparamColumns$ | async"
      [metricColumns]="metricColumns$ | async"
      [showExperimentName]="isExperimentNameVisible()"
      [pageItems]="pageItems$ | async"
      [filteredItemsLength]="filteredItemsLength$ | async"
      [allItemsLength]="allItemsLength$ | async"
      [loading]="loading$ | async"
      [paginationOption]="paginationOption$ | async"
      [regexFilter]="regexFilter$ | async"
      [sortOption]="sortOption$ | async"
      [usePagination]="usePagination"
      (onSelectionToggle)="onRunSelectionToggle($event)"
      (onSelectionDblClick)="onRunSelectionDblClick($event)"
      (onPageSelectionToggle)="onPageSelectionToggle($event)"
      (onPaginationChange)="onPaginationChange($event)"
      (onRegexFilterChange)="onRegexFilterChange($event)"
      (onSortChange)="onSortChange($event)"
      (onRunColorChange)="onRunColorChange($event)"
      (onHparamIntervalFilterChanged)="onHparamIntervalFilterChanged($event)"
      (onHparamDiscreteFilterChanged)="onHparamDiscreteFilterChanged($event)"
      (onMetricFilterChanged)="onMetricFilterChanged($event)"
    ></runs-table-component>
    <ng-container *ngIf="HParamsEnabled.value">
      <button (click)="openColumnSelector()">Click Me Maybe?</button>
      <tb-data-table
        [headers]="runsColumns"
        [data]="allRunsTableData$ | async"
        [sortingInfo]="sortingInfo"
        [columnCustomizationEnabled]="columnCustomizationEnabled"
        [smoothingEnabled]="smoothingEnabled"
        (sortDataBy)="sortDataBy($event)"
        (orderColumns)="orderColumns($event)"
      ></tb-data-table>
      <ng-container> </ng-container
    ></ng-container>
  `,
  host: {
    '[class.flex-layout]': 'useFlexibleLayout',
  },
  styles: [
    `
      :host.flex-layout {
        display: flex;
      }

      :host.flex-layout > runs-table-component {
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunsTableContainer implements OnInit, OnDestroy {
  private allUnsortedRunTableItems$?: Observable<RunTableItem[]>;
  allRunsTableData$: Observable<TableData[]> = of([]);
  loading$: Observable<boolean> | null = null;
  filteredItemsLength$?: Observable<number>;
  allItemsLength$?: Observable<number>;
  pageItems$?: Observable<RunTableItem[]>;
  numSelectedItems$?: Observable<number>;

  // TODO(jameshollyer): Move these values to ngrx and make these Observables.
  runsColumns = [
    {
      type: ColumnHeaderType.RUN,
      name: 'run',
      displayName: 'Run',
      enabled: true,
    },
  ];
  sortingInfo = {
    header: ColumnHeaderType.RUN,
    name: 'run',
    order: SortingOrder.ASCENDING,
  };
  columnCustomizationEnabled = true;
  smoothingEnabled = false;

  hparamColumns$: Observable<HparamColumn[]> = of([]);
  metricColumns$: Observable<MetricColumn[]> = of([]);

  /**
   * Enables a layout mode intended for scenarios when changing the # of runs
   * should have no effect on the table's size.
   *
   * - height and width span the container height and width
   * - run list scrolls vertically, not horizontally
   * - 'name' cells wrap text
   */
  @Input() useFlexibleLayout?: boolean = false;

  /**
   * Whether to use pagination options from the store. If false, the table will
   * show a single page with all runs.
   */
  @Input() usePagination?: boolean = false;

  // Column to disable in the table. The columns are rendered in the order as
  // defined by this input.
  @Input()
  columns: RunsTableColumn[] = [RunsTableColumn.RUN_NAME];

  @Input() experimentIds!: string[];
  @Input() showHparamsAndMetrics = false;

  sortOption$ = this.store.select(getRunSelectorSort);
  paginationOption$ = this.store.select(getRunSelectorPaginationOption);
  regexFilter$ = this.store.select(getRunSelectorRegexFilter);
  HParamsEnabled = new BehaviorSubject<boolean>(false);

  // Allow the dialog component type to be overridden for testing purposes.
  columnSelectorDialogType: ComponentType<any> = ColumnSelectorModal;
  private readonly ngUnsubscribe = new Subject<void>();
  private columnSelectorDialog?: MatDialogRef<ColumnSelectorModal>;

  constructor(
    private readonly store: Store<State>,
    private dialog: MatDialog
  ) {}

  isExperimentNameVisible() {
    return this.columns.some((column) => {
      return column === RunsTableColumn.EXPERIMENT_NAME;
    });
  }

  openColumnSelector() {
    this.store
      .select(getPotentialHparamColumns)
      .pipe(combineLatestWith(this.runsColumns));
    this.columnSelectorDialog = this.dialog.open(this.columnSelectorDialogType);
  }

  ngOnInit() {
    this.store.select(getEnableHparamsInTimeSeries).subscribe((enabled) => {
      this.HParamsEnabled.next(enabled);
    });
    const getRunTableItemsPerExperiment = this.experimentIds.map((id) =>
      this.getRunTableItemsForExperiment(id)
    );

    const getRunTableDataPerExperiment$ = this.experimentIds.map((id) =>
      this.getRunTableDataForExperiment(id)
    );

    this.allRunsTableData$ = combineLatest(getRunTableDataPerExperiment$).pipe(
      map((itemsForExperiments: TableData[][]) => {
        const items = [] as TableData[];
        return items.concat(...itemsForExperiments);
      })
    );

    const rawAllUnsortedRunTableItems$ = combineLatest(
      getRunTableItemsPerExperiment
    ).pipe(
      map((itemsForExperiments: RunTableItem[][]) => {
        const items = [] as RunTableItem[];
        return items.concat(...itemsForExperiments);
      })
    );
    this.allUnsortedRunTableItems$ = rawAllUnsortedRunTableItems$.pipe(
      takeUntil(this.ngUnsubscribe),
      shareReplay(1)
    );
    this.allItemsLength$ = this.allUnsortedRunTableItems$.pipe(
      map((items) => items.length)
    );

    const getFilteredItems$ = this.getFilteredItems$(
      this.allUnsortedRunTableItems$
    ).pipe(takeUntil(this.ngUnsubscribe), shareReplay(1));

    this.filteredItemsLength$ = getFilteredItems$.pipe(
      map((items) => items.length)
    );
    this.pageItems$ = this.sortedAndSlicedItems$(getFilteredItems$);
    this.numSelectedItems$ = this.allUnsortedRunTableItems$.pipe(
      map((items) => {
        return items.reduce((count, item) => {
          return count + Number(item.selected);
        }, 0);
      })
    );

    const getRunsLoadingPerExperiment = this.experimentIds.map((id) => {
      return this.store.select(getRunsLoading, {experimentId: id});
    });
    this.loading$ = combineLatest(getRunsLoadingPerExperiment).pipe(
      map((experimentsLoading) => {
        return experimentsLoading.some((isLoading) => isLoading);
      })
    );

    if (this.showHparamsAndMetrics) {
      const getHparamAndMetrics$ = this.store.select(
        hparamsSelectors.getExperimentsHparamsAndMetricsSpecs,
        {experimentIds: this.experimentIds}
      );

      // combineLatest, when initializing, emits twice
      this.hparamColumns$ = combineLatest([
        this.store.select(
          hparamsSelectors.getHparamFilterMap,
          this.experimentIds
        ),
        getHparamAndMetrics$,
      ]).pipe(
        map(([filterMap, {hparams}]) => {
          return hparams.map(({name, displayName, domain}) => {
            const filter = filterMap.get(name);
            if (!filter) {
              throw new RangeError(
                `Invariant error: a filter for ${name} must exist` +
                  ` when the hparam exists`
              );
            }
            return {displayName, name, filter};
          });
        })
      );

      this.metricColumns$ = combineLatest([
        this.store.select(
          hparamsSelectors.getMetricFilterMap,
          this.experimentIds
        ),
        getHparamAndMetrics$,
      ]).pipe(
        map(([filterMap, {metrics}]) => {
          return metrics.map(({tag, displayName}) => {
            const filter = filterMap.get(tag);
            if (!filter) {
              throw new RangeError(
                `Invariant error: a filter for ${tag} must exist ` +
                  `when the metric exists`
              );
            }
            return {displayName, tag, filter};
          });
        })
      );
    }

    /**
     * For consumers who show checkboxes, notify users that new runs may not be
     * selected by default.
     *
     * Warning: this pattern is not recommended in general. Dispatching
     * `alertReported` would be better handled in a Ngrx Reducer in response
     * to `fetchRunsSucceeded` or via the declared alert registrations using
     * `alertFromAction`. Unfortunately, those currently have no way of knowing
     * whether a run table is actually shown (with checkboxes), so we make a
     * special exception here. A more 'Ngrx pure' approach would require making
     * the store aware of the visibility of any run tables.
     */
    if (this.columns.includes(RunsTableColumn.CHECKBOX)) {
      const runsExceedLimitForRoute$ = this.store.select(getActiveRoute).pipe(
        takeUntil(this.ngUnsubscribe),
        distinctUntilChanged((prevRoute, currRoute) => {
          // Avoid showing it more than once per route, since it would be
          // annoying to see the alert on every auto-reload or when user
          // changes tabs.
          return areSameRouteKindAndExperiments(prevRoute, currRoute);
        }),
        switchMap(() => {
          return rawAllUnsortedRunTableItems$.pipe(
            filter((runTableItems: RunTableItem[]) => {
              return runTableItems.length > MAX_NUM_RUNS_TO_ENABLE_BY_DEFAULT;
            }),
            take(1)
          );
        })
      );
      runsExceedLimitForRoute$.subscribe(() => {
        const text =
          `The number of runs exceeds ` +
          `${MAX_NUM_RUNS_TO_ENABLE_BY_DEFAULT}. New runs are unselected ` +
          `for performance reasons.`;
        this.store.dispatch(
          alertActions.alertReported({localizedMessage: text})
        );
      });
    }

    this.store.dispatch(runTableShown({experimentIds: this.experimentIds}));
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  private getFilteredItems$(runItems$: Observable<RunTableItem[]>) {
    return combineLatest([
      runItems$,
      this.store.select(getRunSelectorRegexFilter),
    ]).pipe(
      map(([items, regexString]) => {
        if (!regexString) {
          return items;
        }

        const shouldIncludeExperimentName = this.columns.includes(
          RunsTableColumn.EXPERIMENT_NAME
        );
        return items.filter((item) => {
          return matchRunToRegex(
            {
              runName: item.run.name,
              experimentAlias: item.experimentAlias,
            },
            regexString,
            shouldIncludeExperimentName
          );
        });
      }),
      switchMap((items) => {
        if (!this.showHparamsAndMetrics) {
          return of(items);
        }

        return combineLatest(
          this.store.select(
            hparamsSelectors.getHparamFilterMap,
            this.experimentIds
          ),
          this.store.select(
            hparamsSelectors.getMetricFilterMap,
            this.experimentIds
          )
        ).pipe(
          map(([hparamFilters, metricFilters]) => {
            return items.filter(({hparams, metrics}) => {
              const hparamMatches = [...hparamFilters.entries()].every(
                ([hparamName, filter]) => {
                  const value = hparams.get(hparamName);
                  return matchFilter(filter, value);
                }
              );

              return (
                hparamMatches &&
                [...metricFilters.entries()].every(([metricTag, filter]) => {
                  const value = metrics.get(metricTag);
                  return matchFilter(filter, value);
                })
              );
            });
          })
        );
      })
    );
  }

  private sortedAndSlicedItems$(filteredItems$: Observable<RunTableItem[]>) {
    const sortedItems = combineLatest([
      filteredItems$,
      this.store.select(getRunSelectorSort),
    ]).pipe(
      map(([items, sort]) => {
        return sortRunTableItems(items, sort);
      })
    );

    const slicedItems = combineLatest([
      sortedItems,
      this.store.select(getRunSelectorPaginationOption),
    ]).pipe(
      map(([items, paginationOption]) => {
        if (!this.usePagination) {
          return items.slice();
        }
        const {pageSize, pageIndex} = paginationOption;
        return items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
      }),
      startWith([])
    );

    return slicedItems;
  }

  private getRunTableDataForExperiment(
    experimentId: string
  ): Observable<TableData[]> {
    return combineLatest([
      this.store.select(getRuns, {experimentId}),
      this.store.select(getRunColorMap),
    ]).pipe(
      map(([runs, colorMap]) => {
        return runs.map((run) => {
          const tableData: TableData = {
            id: run.id,
            color: colorMap[run.id],
          };
          this.runsColumns.forEach((column) => {
            switch (column.type) {
              case ColumnHeaderType.RUN:
                tableData[column.name!] = run.name;
                break;
              default:
                break;
            }
          });
          return tableData;
        });
      })
    );
  }

  private getRunTableItemsForExperiment(
    experimentId: string
  ): Observable<RunTableItem[]> {
    return combineLatest([
      this.store.select(getRuns, {experimentId}),
      this.store.select(getExperiment, {experimentId}),
      this.store.select(getCurrentRouteRunSelection),
      this.store.select(getRunColorMap),
      this.store.select(getExperimentIdToExperimentAliasMap),
    ]).pipe(
      map(([runs, experiment, selectionMap, colorMap, experimentIdToAlias]) => {
        return runs.map((run) => {
          const hparamMap: RunTableItem['hparams'] = new Map();
          (run.hparams || []).forEach((hparam) => {
            hparamMap.set(hparam.name, hparam.value);
          });
          const metricMap: RunTableItem['metrics'] = new Map();
          (run.metrics || []).forEach((metric) => {
            metricMap.set(metric.tag, metric.value);
          });
          return {
            run,
            experimentName: experiment?.name || '',
            experimentAlias: experimentIdToAlias[experimentId],
            selected: Boolean(selectionMap && selectionMap.get(run.id)),
            runColor: colorMap[run.id],
            hparams: hparamMap,
            metrics: metricMap,
          };
        });
      })
    );
  }

  onRunSelectionToggle(item: RunTableItem) {
    this.store.dispatch(
      runSelectionToggled({
        runId: item.run.id,
      })
    );
  }

  onRunSelectionDblClick(item: RunTableItem) {
    // Note that a user's double click will trigger both 'change' and 'dblclick'
    // events so onRunSelectionToggle() will also be called and we will fire
    // two somewhat conflicting actions: runSelectionToggled and
    // singleRunSelected. This is ok as long as singleRunSelected is fired last.
    //
    // We are therefore relying on the mat-checkbox 'change' event consistently
    // being fired before the 'dblclick' event. Although we don't have any
    // documentation that guarantees this order, we do have documentation that
    // states that 'click' is guaranteed to occur before 'dblclick'
    // (see https://www.quirksmode.org/dom/events/click.html). We presume, then,
    // that we can rely on the 'change' event being fired before the 'dblclick'
    // event.
    this.store.dispatch(
      singleRunSelected({
        runId: item.run.id,
      })
    );
  }

  // When `usePagination` is false, page selection affects the single page,
  // containing all items.
  onPageSelectionToggle(event: {items: RunTableItem[]}) {
    const {items} = event;
    const runIds = items.map(({run}) => run.id);

    this.store.dispatch(
      runPageSelectionToggled({
        runIds,
      })
    );
  }

  onPaginationChange(event: {pageIndex: number; pageSize: number}) {
    if (!this.usePagination) {
      throw new Error(
        'Pagination events cannot be dispatched when pagination is disabled'
      );
    }
    const {pageIndex, pageSize} = event;
    this.store.dispatch(
      runSelectorPaginationOptionChanged({pageIndex, pageSize})
    );
  }

  onSortChange(sort: {key: SortKey; direction: SortDirection}) {
    this.store.dispatch(runSelectorSortChanged(sort));
  }

  onRegexFilterChange(regexString: string) {
    this.store.dispatch(runSelectorRegexFilterChanged({regexString}));
  }

  onRunColorChange({runId, newColor}: {runId: string; newColor: string}) {
    this.store.dispatch(runColorChanged({runId, newColor}));
  }

  onHparamDiscreteFilterChanged(event: {
    hparamName: string;
    includeUndefined: boolean;
    filterValues: DiscreteHparamValues;
  }) {
    const {hparamName, filterValues, includeUndefined} = event;
    this.store.dispatch(
      hparamsActions.hparamsDiscreteHparamFilterChanged({
        experimentIds: this.experimentIds,
        hparamName,
        filterValues,
        includeUndefined,
      })
    );
  }

  onHparamIntervalFilterChanged(event: IntervalFilterChange) {
    const {name, filterLowerValue, filterUpperValue, includeUndefined} = event;
    this.store.dispatch(
      hparamsActions.hparamsIntervalHparamFilterChanged({
        experimentIds: this.experimentIds,
        hparamName: name,
        filterLowerValue,
        filterUpperValue,
        includeUndefined,
      })
    );
  }

  onMetricFilterChanged(event: IntervalFilterChange) {
    const {name, includeUndefined, filterLowerValue, filterUpperValue} = event;
    this.store.dispatch(
      hparamsActions.hparamsMetricFilterChanged({
        experimentIds: this.experimentIds,
        metricTag: name,
        includeUndefined,
        filterLowerValue,
        filterUpperValue,
      })
    );
  }
}

export const TEST_ONLY = {
  getRunsLoading,
};
