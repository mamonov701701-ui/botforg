import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/api/client', () => ({
  default: {
    get: client.get,
    post: client.post,
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  getCustomBlockMarketplaceListings,
  getCustomBlockMarketplaceGrants,
  getCustomBlockMarketplaceReviews,
  getMyCustomBlockMarketplaceListings,
  getMyCustomBlockMarketplaceRequests,
  getMyEligibleCustomBlockVersions,
  installCustomBlockMarketplaceListing,
  contactCustomBlockMarketplaceAuthor,
  grantCustomBlockMarketplaceAccess,
  grantCustomBlockDirectAccess,
  getMyCustomBlockRightsOverview,
} from '@/api/customBlockMarketplace';

describe('Custom Block Marketplace API collections', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
  });

  it.each([
    ['empty', []],
    ['one item', [{ id: 1 }]],
    ['multiple items', [{ id: 1 }, { id: 2 }]],
  ])('supports a listings response envelope: %s', async (_case, items) => {
    client.get.mockResolvedValue({ items, total: items.length, limit: 24, offset: 0 });

    await expect(getMyCustomBlockMarketplaceListings()).resolves.toEqual(items);
  });

  it('keeps backward compatibility with raw array collection responses', async () => {
    const items = [{ id: 1, title: 'Версия', version: 1 }];
    client.get.mockResolvedValue(items);

    await expect(getMyEligibleCustomBlockVersions()).resolves.toEqual(items);
  });

  it.each([
    ['listings', getMyCustomBlockMarketplaceListings],
    ['versions', getMyEligibleCustomBlockVersions],
    ['requests', getMyCustomBlockMarketplaceRequests],
    ['grants', () => getCustomBlockMarketplaceGrants(41)],
    ['reviews', () => getCustomBlockMarketplaceReviews(41)],
    ['rights overview', getMyCustomBlockRightsOverview],
  ])('preserves empty results and propagates errors for %s', async (_name, request) => {
    client.get.mockResolvedValue([]);
    await expect(request()).resolves.toEqual([]);
    client.get.mockResolvedValue({ items: [] });
    await expect(request()).resolves.toEqual([]);
    const error = Object.assign(new Error('Ошибка запроса'), { status: 404 });
    client.get.mockRejectedValue(error);
    await expect(request()).rejects.toThrow('Ошибка запроса');
  });

  it.each([
    ['eligible versions', getMyEligibleCustomBlockVersions],
    ['access requests', getMyCustomBlockMarketplaceRequests],
    ['grants', () => getCustomBlockMarketplaceGrants(41)],
    ['reviews', () => getCustomBlockMarketplaceReviews(41)],
  ])('normalizes an envelope for %s', async (_name, request) => {
    const items = [{ id: 1 }];
    client.get.mockResolvedValue({ items });

    await expect(request()).resolves.toEqual(items);
  });

  it('rejects an invalid collection contract instead of leaking a non-array to the page', async () => {
    client.get.mockResolvedValue({ total: 1 });

    await expect(getMyCustomBlockMarketplaceListings()).rejects.toThrow(
      'Некорректный ответ API для коллекции размещений'
    );
  });

  it('serializes search and category filters for public discovery', async () => {
    client.get.mockResolvedValue({ items: [] });

    await getCustomBlockMarketplaceListings({ search: 'поддержка', category: 'support' });

    expect(client.get).toHaveBeenCalledWith(
      '/custom-block-marketplace/listings?search=%D0%BF%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%BA%D0%B0&category=support'
    );
  });

  it('keeps library installation, author contact and exact-version grant as distinct API calls', async () => {
    client.post.mockResolvedValue({});
    await installCustomBlockMarketplaceListing(17);
    await contactCustomBlockMarketplaceAuthor(17, 'Здравствуйте');
    await grantCustomBlockMarketplaceAccess(41, 12345678);
    expect(client.post).toHaveBeenNthCalledWith(1, '/custom-block-marketplace/listings/17/install');
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      '/custom-block-marketplace/listings/17/contact',
      { message: 'Здравствуйте' }
    );
    await grantCustomBlockDirectAccess(41, 12345678);
    expect(client.post).toHaveBeenNthCalledWith(3, '/custom-block-marketplace/versions/41/grants', {
      recipient_public_id: 12345678,
    });
    expect(client.post).toHaveBeenNthCalledWith(
      4,
      '/custom-block-marketplace/versions/41/direct-grants',
      { recipient_public_id: 12345678 }
    );
  });
});
