import {Injectable} from '@angular/core';
import {Action, Store, createAction} from '@ngrx/store';
import {
  State,
  getCardInteractions,
  getCardMetadataMap,
  getPreviousCardInteractions,
} from '../store';
import {Actions, OnInitEffects, createEffect, ofType} from '@ngrx/effects';
import {CardInteractionsDataSource} from '../data_source/card_interactions_data_source';
import {withLatestFrom, skip, tap} from 'rxjs';
import {metricsPreviousCardInteractionsChanged} from '../actions';
import {getActiveNamespaceId} from '../../app_routing/store/app_routing_selectors';
import {CardIdWithMetadata} from '../types';

const initAction = createAction('[Card Interaction Effects] Init');

@Injectable()
export class CardInteractionEffects implements OnInitEffects {
  constructor(
    private readonly actions$: Actions,
    private readonly store: Store<State>,
    private readonly dataSource: CardInteractionsDataSource
  ) {}

  /** @export */
  ngrxOnInitEffects(): Action {
    return initAction();
  }

  private getCardInteractions$ = this.store.select(getCardInteractions).pipe(
    // Don't get the initial state
    skip(1)
  );

  private getPreviousCardInteractions$ = this.store
    .select(getPreviousCardInteractions)
    .pipe(
      // Don't get the initial state
      skip(1)
    );

  readonly onInitEffect$ = createEffect(
    () => {
      return this.actions$.pipe(
        ofType(initAction),
        tap(() => {
          this.store.dispatch(
            metricsPreviousCardInteractionsChanged({
              cardInteractions: this.dataSource.getCardInteractions(),
            })
          );
        })
      );
    },
    {dispatch: false}
  );

  /** @export */
  readonly cardInteractionsEffect$ = createEffect(
    () => {
      return this.getCardInteractions$.pipe(
        tap((cardInteractions) => {
          this.dataSource.saveCardInteractions(cardInteractions);
        })
      );
    },
    {dispatch: false}
  );

  /** @export */
  readonly updateInteractionsOnNavigationEffect$ = createEffect(
    () => {
      return this.store.select(getActiveNamespaceId).pipe(
        withLatestFrom(
          this.getCardInteractions$,
          this.getPreviousCardInteractions$,
          this.store.select(getCardMetadataMap)
        ),
        tap(([, cardInteractions, previousCardInteractions, metadataMap]) => {
          const nextCardInteractions = {
            pins: makeUnique([
              ...cardInteractions.pins,
              ...previousCardInteractions.pins,
            ]),
            clicks: makeUnique([
              ...cardInteractions.clicks,
              ...previousCardInteractions.clicks,
            ]),
            tagFilters: Array.from(
              new Set([
                ...cardInteractions.tagFilters,
                ...previousCardInteractions.tagFilters,
              ])
            ),
          };

          this.store.dispatch(
            metricsPreviousCardInteractionsChanged({
              cardInteractions: nextCardInteractions,
            })
          );

          function makeUnique(cardMetadata: CardIdWithMetadata[]) {
            return Array.from(
              new Set(cardMetadata.map(({cardId}) => cardId))
            ).map((cardId) => ({...metadataMap[cardId], cardId}));
          }
        })
      );
    },
    {dispatch: false}
  );
}

export const TEST_ONLY = {
  initAction,
};
