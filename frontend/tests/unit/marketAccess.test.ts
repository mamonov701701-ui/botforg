import { describe, it, expect } from 'vitest';
import {
  getMarketAccessRequestSuccessMessage,
  getMarketAccessRequestChatPath,
  getMarketItemPrimaryActionState,
  getMarketInstallActionLabel,
  MARKET_ACCESS_REQUEST_SUCCESS_MESSAGE,
  MARKET_ACCESS_REQUEST_ALREADY_EXISTS_MESSAGE,
  MARKET_ACCESS_REQUEST_PENDING_LABEL,
  type MarketItemAccessStatus,
} from '@/api/market';

const grantedAccess = (itemType: string): MarketItemAccessStatus => ({
  item_id: 1,
  is_paid: true,
  has_grant: true,
  can_install: true,
  status: 'access_granted',
  chat_room_id: 10,
  request: null,
});

describe('marketAccess helpers', () => {
  it('returns toast messages for new and existing access requests', () => {
    expect(getMarketAccessRequestSuccessMessage(false)).toBe(MARKET_ACCESS_REQUEST_SUCCESS_MESSAGE);
    expect(getMarketAccessRequestSuccessMessage(true)).toBe(
      MARKET_ACCESS_REQUEST_ALREADY_EXISTS_MESSAGE
    );
  });

  it('builds messages deep link path', () => {
    expect(getMarketAccessRequestChatPath(42)).toBe('/dashboard/messages?roomId=42');
  });

  it('shows install label for paid item when access is granted', () => {
    expect(
      getMarketItemPrimaryActionState(
        { price: 500, item_type: 'scenario' },
        grantedAccess('scenario')
      ).label
    ).toBe(getMarketInstallActionLabel('scenario'));
    expect(
      getMarketItemPrimaryActionState(
        { price: 500, item_type: 'template' },
        grantedAccess('template')
      ).label
    ).toBe(getMarketInstallActionLabel('template'));
  });

  it('shows pending label for active access request', () => {
    const pending: MarketItemAccessStatus = {
      item_id: 1,
      is_paid: true,
      has_grant: false,
      can_install: false,
      status: 'new',
      chat_room_id: 5,
    };
    expect(
      getMarketItemPrimaryActionState({ price: 100, item_type: 'scenario' }, pending).label
    ).toBe(MARKET_ACCESS_REQUEST_PENDING_LABEL);
  });

  it('allows new request after rejection', () => {
    const rejected: MarketItemAccessStatus = {
      item_id: 1,
      is_paid: true,
      has_grant: false,
      can_install: false,
      status: 'rejected',
    };
    expect(
      getMarketItemPrimaryActionState({ price: 100, item_type: 'scenario' }, rejected).label
    ).toBe('Запросить доступ снова');
  });
});
