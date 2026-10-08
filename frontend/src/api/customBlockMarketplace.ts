import api from './client';

type CollectionEnvelope<T> = { items: T[] };

function normalizeCollection<T>(payload: unknown, collectionName: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload !== null &&
    typeof payload === 'object' &&
    Array.isArray((payload as CollectionEnvelope<T>).items)
  ) {
    return (payload as CollectionEnvelope<T>).items;
  }
  throw new Error(`Некорректный ответ API для коллекции ${collectionName}`);
}

export type CustomBlockMarketplaceListing = {
  id: number;
  custom_block_version_id: number;
  stable_block_id: string;
  version: number;
  title: string;
  block_title: string;
  description: string;
  category: string;
  tags: string[];
  visibility: 'public' | 'unlisted' | 'private';
  access_policy: 'self_install' | 'author_approval' | 'explicit_grant';
  commercial_mode: 'free' | 'paid' | 'external_terms';
  price_amount: number | string | null;
  price_currency: string | null;
  lifecycle: 'draft' | 'published' | 'archived';
  created_at: string;
  user_guide: Record<string, unknown>;
  rating_average: number | null;
  rating_count: number;
  author: { id: number; name?: string };
  access: {
    is_owner: boolean;
    can_self_install: boolean;
    can_request_access: boolean;
    can_add_new_node: boolean;
    has_active_grant: boolean;
    has_grant_history: boolean;
    is_installed: boolean;
    listing_available: boolean;
    request_state: 'pending' | 'approved' | 'rejected' | null;
    chat_room_id: number | null;
  };
  reviews?: { id: number; author_user_id: number; rating: number; text: string }[];
};

export type CustomBlockMarketplaceRequest = {
  id: number;
  custom_block_version_id: number;
  listing_id: number | null;
  version: number;
  block_title: string;
  requester_user_id: number;
  requester_name: string;
  state: 'pending' | 'approved' | 'rejected';
  message: string;
  chat_room_id: number | null;
};

export type CustomBlockMarketplaceGrant = {
  id: number;
  recipient_user_id: number;
  recipient_name: string;
  status: 'active' | 'revoked';
  grant_source: string;
};

export const getCustomBlockMarketplaceListings = (
  filters: { search?: string; category?: string } = {}
) => {
  const query = new URLSearchParams();
  if (filters.search) query.set('search', filters.search);
  if (filters.category) query.set('category', filters.category);
  const suffix = query.toString();
  return api.get(`/custom-block-marketplace/listings${suffix ? `?${suffix}` : ''}`) as Promise<{
    items: CustomBlockMarketplaceListing[];
  }>;
};
export const getCustomBlockMarketplaceListing = (id: number) =>
  api.get(`/custom-block-marketplace/listings/${id}`) as Promise<CustomBlockMarketplaceListing>;
export const installCustomBlockMarketplaceListing = (id: number) =>
  api.post(`/custom-block-marketplace/listings/${id}/install`);
export const installGrantedCustomBlockVersion = (versionId: number) =>
  api.post(`/custom-block-marketplace/versions/${versionId}/install`);
export type GrantedCustomBlockVersion = {
  custom_block_version_id: number;
  title: string;
  version: number;
  original_author_user_id: number;
  listing_id: number | null;
  is_installed: boolean;
  can_install: boolean;
  grant_source: string;
};
export const getMyGrantedCustomBlockVersions = async (): Promise<GrantedCustomBlockVersion[]> =>
  normalizeCollection<GrantedCustomBlockVersion>(
    await api.get('/custom-block-marketplace/mine/granted-versions'),
    'полученных версий'
  );
export type ReceivedCustomBlock = {
  grant_id: number;
  custom_block_version_id: number;
  block_id: number;
  title: string;
  version: number;
  original_author_user_id: number;
  original_author_name: string | null;
  grant_source: string;
  source_channel: 'marketplace' | 'direct' | 'unknown';
  grant_status: 'active' | 'revoked';
  is_installed: boolean;
  has_distribution_right: boolean;
  listing_id: number | null;
  listing_lifecycle: string | null;
  current_commercial_mode: string | null;
};
export const getMyCustomBlockRightsOverview = async (): Promise<ReceivedCustomBlock[]> =>
  normalizeCollection<ReceivedCustomBlock>(
    await api.get('/custom-block-marketplace/mine/rights-overview'),
    'полученных блоков'
  );
export const contactCustomBlockMarketplaceAuthor = (id: number, message = '') =>
  api.post(`/custom-block-marketplace/listings/${id}/contact`, { message }) as Promise<{
    chat_room_id: number;
  }>;
export const requestCustomBlockMarketplaceAccess = (id: number, message = '') =>
  api.post(`/custom-block-marketplace/listings/${id}/access-requests`, { message });
export const saveCustomBlockMarketplaceReview = (versionId: number, rating: number, text: string) =>
  api.put(`/custom-block-marketplace/versions/${versionId}/my-review`, { rating, text });
export const getMyCustomBlockMarketplaceListings = async (): Promise<
  CustomBlockMarketplaceListing[]
> =>
  normalizeCollection<CustomBlockMarketplaceListing>(
    await api.get('/custom-block-marketplace/mine/listings'),
    'размещений'
  );
export const createCustomBlockMarketplaceListing = (
  versionId: number,
  payload: Record<string, unknown>
) =>
  api.post(
    `/custom-block-marketplace/versions/${versionId}/listing`,
    payload
  ) as Promise<CustomBlockMarketplaceListing>;
export const publishCustomBlockMarketplaceListing = (listingId: number) =>
  api.post(
    `/custom-block-marketplace/listings/${listingId}/publish`
  ) as Promise<CustomBlockMarketplaceListing>;
export const archiveCustomBlockMarketplaceListing = (listingId: number) =>
  api.post(
    `/custom-block-marketplace/listings/${listingId}/archive`
  ) as Promise<CustomBlockMarketplaceListing>;
export const restoreCustomBlockMarketplaceListing = (listingId: number) =>
  api.post(
    `/custom-block-marketplace/listings/${listingId}/restore`
  ) as Promise<CustomBlockMarketplaceListing>;
export const updateCustomBlockMarketplaceListing = (
  listingId: number,
  payload: Record<string, unknown>
) =>
  api.put(
    `/custom-block-marketplace/listings/${listingId}`,
    payload
  ) as Promise<CustomBlockMarketplaceListing>;
export const getMyEligibleCustomBlockVersions = async (): Promise<
  { id: number; title: string; version: number }[]
> =>
  normalizeCollection<{ id: number; title: string; version: number }>(
    await api.get('/custom-block-marketplace/mine/eligible-versions'),
    'доступных версий'
  );
export const getMyCustomBlockMarketplaceRequests = async (): Promise<
  CustomBlockMarketplaceRequest[]
> =>
  normalizeCollection<CustomBlockMarketplaceRequest>(
    await api.get('/custom-block-marketplace/access-requests/mine'),
    'запросов доступа'
  );
export const approveCustomBlockMarketplaceRequest = (id: number, note = '') =>
  api.post(`/custom-block-marketplace/access-requests/${id}/approve`, { note });
export const rejectCustomBlockMarketplaceRequest = (id: number, note = '') =>
  api.post(`/custom-block-marketplace/access-requests/${id}/reject`, { note });
export const getCustomBlockMarketplaceGrants = async (
  versionId: number
): Promise<CustomBlockMarketplaceGrant[]> =>
  normalizeCollection<CustomBlockMarketplaceGrant>(
    await api.get(`/custom-block-marketplace/versions/${versionId}/grants`),
    'выданных прав'
  );
export const grantCustomBlockMarketplaceAccess = (versionId: number, recipientPublicId: number) =>
  api.post(`/custom-block-marketplace/versions/${versionId}/grants`, {
    recipient_public_id: recipientPublicId,
  });
export const grantCustomBlockDirectAccess = (versionId: number, recipientPublicId: number) =>
  api.post(`/custom-block-marketplace/versions/${versionId}/direct-grants`, {
    recipient_public_id: recipientPublicId,
  });
export const grantCustomBlockDistribution = (versionId: number, recipientPublicId: number) =>
  api.post(`/custom-block-marketplace/versions/${versionId}/distribution-grants`, {
    recipient_public_id: recipientPublicId,
  });
export const revokeCustomBlockMarketplaceGrant = (id: number) =>
  api.post(`/custom-block-marketplace/grants/${id}/revoke`);
export const getCustomBlockMarketplaceReviews = async (
  versionId: number
): Promise<{ id: number; author_name: string; rating: number; text: string }[]> =>
  normalizeCollection<{ id: number; author_name: string; rating: number; text: string }>(
    await api.get(`/custom-block-marketplace/versions/${versionId}/reviews`),
    'отзывов'
  );
