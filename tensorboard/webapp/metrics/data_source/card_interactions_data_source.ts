import {Injectable} from '@angular/core';
import {CardInteractions} from '../store/metrics_types';

const CARD_INTERACTIONS_KEY = 'tb-card-interactions';

const MAX_RECORDS: Record<keyof CardInteractions, number> = {
  pins: 10,
  clicks: 10,
  tagFilters: 10,
};

@Injectable()
export class CardInteractionsDataSource {
  saveCardInteractions(cardInteractions: CardInteractions) {
    const trimmedInteractions: CardInteractions = {
      pins: cardInteractions.pins.slice(
        cardInteractions.pins.length - MAX_RECORDS.pins
      ),
      clicks: cardInteractions.clicks.slice(
        cardInteractions.clicks.length - MAX_RECORDS.clicks
      ),
      tagFilters: cardInteractions.tagFilters.slice(
        cardInteractions.tagFilters.length - MAX_RECORDS.tagFilters
      ),
    };
    localStorage.setItem(
      CARD_INTERACTIONS_KEY,
      JSON.stringify(trimmedInteractions)
    );
  }

  getCardInteractions(): CardInteractions {
    const existingInteractions = localStorage.getItem(CARD_INTERACTIONS_KEY);
    if (existingInteractions) {
      return JSON.parse(existingInteractions) as CardInteractions;
    }
    return {
      tagFilters: [],
      pins: [],
      clicks: [],
    };
  }
}
