import { describe, it, expect } from 'vitest';
import {
  getMarketAccessRequestSuccessMessage,
  getMarketAccessRequestChatPath,
  MARKET_ACCESS_REQUEST_SUCCESS_MESSAGE,
  MARKET_ACCESS_REQUEST_ALREADY_EXISTS_MESSAGE,
} from '@/api/market';

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
});
