import {Action, Store} from '@ngrx/store';
import {Subject} from 'rxjs';
import {CardInteractionsDataSource} from '../data_source/card_interactions_data_source';
import {MockStore} from '@ngrx/store/testing';
import {State} from '../../app_state';
import {CardInteractionEffects, TEST_ONLY} from './card_interaction_effects';
import {TestBed, fakeAsync} from '@angular/core/testing';
import {provideMockTbStore} from '../../testing/utils';
import {provideMockActions} from '@ngrx/effects/testing';
import * as actions from '../actions';
import {CardIdWithMetadata, PluginType} from '../internal_types';
import {
  getCardInteractions,
  getCardMetadataMap,
  getPreviousCardInteractions,
} from '../store';
import {getActiveNamespaceId} from '../../app_routing/store/app_routing_selectors';

describe('CardInteractions Effects', () => {
  let dataSource: CardInteractionsDataSource;
  let effects: CardInteractionEffects;
  let store: MockStore<State>;
  let actions$: Subject<Action>;
  let mockStorage: Record<string, string>;
  let dispatchedActions: Action[];

  beforeEach(async () => {
    actions$ = new Subject<Action>();
    mockStorage = {};
    spyOn(window.localStorage, 'setItem').and.callFake(
      (key: string, value: string) => {
        mockStorage[key] = value;
      }
    );

    spyOn(window.localStorage, 'getItem').and.callFake((key: string) => {
      return mockStorage[key];
    });

    await TestBed.configureTestingModule({
      imports: [],
      providers: [
        provideMockActions(actions$),
        CardInteractionsDataSource,
        CardInteractionEffects,
        provideMockTbStore(),
      ],
    }).compileComponents();

    store = TestBed.inject<Store<State>>(Store) as MockStore<State>;
    dataSource = TestBed.inject(CardInteractionsDataSource);
    effects = TestBed.inject(CardInteractionEffects);

    dispatchedActions = [];
    spyOn(store, 'dispatch').and.callFake((action: Action) => {
      dispatchedActions.push(action);
    });
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('onInitEffect$', () => {
    it('rehydrates previousCardInteractions from data source', () => {
      const previousCardInteractions = {
        tagFilters: ['foo', 'bar'],
        pins: [
          {
            cardId: 'card1',
            runId: null,
            plugin: PluginType.SCALARS,
            tag: 'tagA',
          },
        ],
        clicks: [
          {
            cardId: 'card2',
            runId: null,
            plugin: PluginType.SCALARS,
            tag: 'tagB',
          },
        ],
      };
      dataSource.saveCardInteractions(previousCardInteractions);

      effects.onInitEffect$.subscribe();
      actions$.next(TEST_ONLY.initAction());
      expect(dispatchedActions).toEqual([
        actions.metricsPreviousCardInteractionsChanged({
          cardInteractions: previousCardInteractions,
        }),
      ]);
    });
  });

  describe('cardInteractionsEffect$', () => {
    it('skips the initial state', fakeAsync(() => {
      const saveSpy = spyOn(
        dataSource,
        'saveCardInteractions'
      ).and.callThrough();
      effects.cardInteractionsEffect$.subscribe();
      expect(saveSpy).not.toHaveBeenCalled();

      store.overrideSelector(getCardInteractions, {
        tagFilters: ['foo', 'bar'],
        pins: [
          {
            cardId: 'card1',
            runId: null,
            plugin: PluginType.SCALARS,
            tag: 'tagA',
          },
        ],
        clicks: [
          {
            cardId: 'card2',
            runId: null,
            plugin: PluginType.SCALARS,
            tag: 'tagB',
          },
        ],
      });
      store.refreshState();

      expect(saveSpy).toHaveBeenCalled();
    }));
  });

  describe('updateInteractionsOnNavigationEffect$', () => {
    let card1a: CardIdWithMetadata;
    let card1b: CardIdWithMetadata;
    let card2a: CardIdWithMetadata;
    let card2b: CardIdWithMetadata;

    beforeEach(() => {
      card1a = {
        cardId: 'card1a',
        runId: null,
        tag: '1a',
        plugin: PluginType.SCALARS,
      };
      card1b = {
        cardId: 'card1b',
        runId: null,
        tag: '1b',
        plugin: PluginType.SCALARS,
      };
      card2a = {
        cardId: 'card2a',
        runId: null,
        tag: '2a',
        plugin: PluginType.SCALARS,
      };
      card2b = {
        cardId: 'card2b',
        runId: null,
        tag: '2b',
        plugin: PluginType.SCALARS,
      };

      store.overrideSelector(getCardMetadataMap, {
        card1a,
        card1b,
        card2a,
        card2b,
      });

      effects.updateInteractionsOnNavigationEffect$.subscribe();
    });

    it('merges current and previous card interactions', () => {
      store.overrideSelector(getCardInteractions, {
        pins: [card1a],
        clicks: [card1b],
        tagFilters: ['foo'],
      });
      store.overrideSelector(getPreviousCardInteractions, {
        pins: [card2a],
        clicks: [card2b],
        tagFilters: ['bar'],
      });
      store.overrideSelector(getActiveNamespaceId, 'namespace1');
      store.refreshState();

      expect(dispatchedActions).toEqual([
        actions.metricsPreviousCardInteractionsChanged({
          cardInteractions: {
            pins: [card1a, card2a],
            clicks: [card1b, card2b],
            tagFilters: ['foo', 'bar'],
          },
        }),
      ]);
    });

    it('does not emit duplicate cardIds', () => {
      store.overrideSelector(getCardInteractions, {
        pins: [card1a],
        clicks: [card1b],
        tagFilters: ['foo'],
      });
      store.overrideSelector(getPreviousCardInteractions, {
        pins: [card1a],
        clicks: [card1b],
        tagFilters: ['foo'],
      });
      store.overrideSelector(getActiveNamespaceId, 'namespace1');
      store.refreshState();

      expect(dispatchedActions).toEqual([
        actions.metricsPreviousCardInteractionsChanged({
          cardInteractions: {
            pins: [card1a],
            clicks: [card1b],
            tagFilters: ['foo'],
          },
        }),
      ]);
    });
  });
});
