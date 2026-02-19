/**
 * API клиент для маркетплейса
 */
import api from './client';

// ================== Types ==================

export interface MarketItem {
  id: number;
  item_type: 'template' | 'scenario';
  source_bot_id?: number;
  source_scenario_id?: number;
  title: string;
  description?: string;
  additional_description?: string;
  image_url?: string;
  price: number;
  sales_count: number;
  category?: string;
  tags?: string[];
  is_premium: boolean;
  is_active: boolean;
  is_published: boolean;
  seller: {
    id: number;
    name?: string;
    email: string;
    avatar?: string;
  };
  created_at: string;
  updated_at: string;
  published_at?: string;
  average_rating?: number;
  rating_count: number;
}

export interface MarketItemCreate {
  item_type: 'template' | 'scenario';
  source_bot_id?: number;
  source_scenario_id?: number;
  title: string;
  description?: string;
  additional_description?: string;
  image_url?: string;
  price: number;
  category?: string;
  tags?: string[];
  is_premium?: boolean;
  is_published?: boolean;
}

export interface MarketItemListResponse {
  total: number;
  items: MarketItem[];
  page: number;
  page_size: number;
}

export interface MyTemplate {
  id: number;
  name: string;
  status: 'published' | 'draft';
  moderation_status: 'draft' | 'pending' | 'approved' | 'rejected';
  moderation_rejection_reason?: string | null;
  installs_count: number;
  views_count: number;
  created_at: string;
}

export interface MarketOrder {
  id: number;
  title: string;
  description: string;
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  category?: string;
  skills?: string[];
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  author: {
    id: number;
    name?: string;
    email: string;
    avatar?: string;
  };
  selected_freelancer?: {
    id: number;
    name?: string;
    email: string;
    avatar?: string;
  };
  created_at: string;
  updated_at: string;
  proposals_count: number;
}

export interface MarketOrderCreate {
  title: string;
  description: string;
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  category?: string;
  skills?: string[];
}

export interface MarketOrderListResponse {
  total: number;
  items: MarketOrder[];
  page: number;
  page_size: number;
}

export interface FreelancerProfile {
  id: number;
  user: {
    id: number;
    name?: string;
    email: string;
    avatar?: string;
  };
  title: string;
  description?: string;
  hourly_rate?: number;
  skills?: string[];
  portfolio_items?: string[];
  completed_orders_count: number;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  average_rating?: number;
  rating_count: number;
}

export interface FreelancerProfileCreate {
  title: string;
  description?: string;
  hourly_rate?: number;
  skills?: string[];
  portfolio_items?: string[];
}

export interface MarketReview {
  id: number;
  item_type: string;
  item_id: number;
  author: {
    id: number;
    name?: string;
    email: string;
    avatar?: string;
  };
  rating: number;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface MarketReviewCreate {
  item_type: 'market_item' | 'market_order' | 'freelancer';
  item_id: number;
  rating: number;
  comment?: string;
}

// ================== Creator Dashboard (Developer plan) ==================

/**
 * Получить список своих шаблонов (кабинет разработчика).
 * Требует тариф Developer.
 */
export async function getMyTemplates(): Promise<MyTemplate[]> {
  return api.get('/api/market/my-templates');
}

/**
 * Отправить шаблон на модерацию (draft → pending).
 * Требует тариф Developer.
 */
export async function submitTemplateToModeration(
  templateId: number
): Promise<{ ok: boolean; moderation_status: string }> {
  return api.post(`/api/market/templates/${templateId}/submit`);
}

// ================== Market Items ==================

/**
 * Получить список товаров на маркетплейсе
 */
export async function getMarketItems(params?: {
  item_type?: 'template' | 'scenario';
  category?: string;
  search?: string;
  min_price?: number;
  max_price?: number;
  is_premium?: boolean;
  is_published?: boolean;
  sort_by?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}): Promise<MarketItemListResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.item_type) searchParams.append('item_type', params.item_type);
      if (params.category) searchParams.append('category', params.category);
      if (params.search) searchParams.append('search', params.search);
      if (params.min_price !== undefined)
        searchParams.append('min_price', params.min_price.toString());
      if (params.max_price !== undefined)
        searchParams.append('max_price', params.max_price.toString());
      if (params.is_premium !== undefined)
        searchParams.append('is_premium', params.is_premium.toString());
      if (params.is_published !== undefined)
        searchParams.append('is_published', params.is_published.toString());
      if (params.sort_by) searchParams.append('sort_by', params.sort_by);
      if (params.order) searchParams.append('order', params.order);
      if (params.page !== undefined) searchParams.append('page', params.page.toString());
      if (params.page_size !== undefined)
        searchParams.append('page_size', params.page_size.toString());
    }
    const url = `/api/market/items${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    return await api.get(url);
  } catch (error: any) {
    console.error('Failed to fetch market items:', error);
    throw error;
  }
}

/**
 * Получить детальную информацию о товаре
 */
export async function getMarketItem(itemId: number): Promise<MarketItem> {
  try {
    return await api.get(`/api/market/items/${itemId}`);
  } catch (error: any) {
    console.error('Failed to fetch market item:', error);
    throw error;
  }
}

/**
 * Создать товар на маркетплейсе
 */
export async function createMarketItem(data: MarketItemCreate): Promise<MarketItem> {
  try {
    return await api.post('/api/market/items', data);
  } catch (error: any) {
    console.error('Failed to create market item:', error);
    throw error;
  }
}

/**
 * Обновить товар на маркетплейсе
 */
export async function updateMarketItem(
  itemId: number,
  data: Partial<MarketItemCreate>
): Promise<MarketItem> {
  try {
    return await api.put(`/api/market/items/${itemId}`, data);
  } catch (error: any) {
    console.error('Failed to update market item:', error);
    throw error;
  }
}

/**
 * Удалить товар с маркетплейса
 */
export async function deleteMarketItem(itemId: number): Promise<void> {
  try {
    await api.delete(`/api/market/items/${itemId}`);
  } catch (error: any) {
    console.error('Failed to delete market item:', error);
    throw error;
  }
}

// ================== Market Orders ==================

/**
 * Получить список заказов
 */
export async function getMarketOrders(params?: {
  status?: string;
  category?: string;
  search?: string;
  sort_by?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}): Promise<MarketOrderListResponse> {
  try {
    return await api.get('/api/market/orders', params);
  } catch (error: any) {
    console.error('Failed to fetch market orders:', error);
    throw error;
  }
}

/**
 * Создать заказ
 */
export async function createMarketOrder(data: MarketOrderCreate): Promise<MarketOrder> {
  try {
    return await api.post('/api/market/orders', data);
  } catch (error: any) {
    console.error('Failed to create market order:', error);
    throw error;
  }
}

// ================== Freelancer Profiles ==================

/**
 * Получить список исполнителей
 */
export async function getFreelancers(params?: {
  search?: string;
  skills?: string;
  is_verified?: boolean;
  sort_by?: string;
  order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}): Promise<{ total: number; items: FreelancerProfile[]; page: number; page_size: number }> {
  try {
    return await api.get('/api/market/freelancers', params);
  } catch (error: any) {
    console.error('Failed to fetch freelancers:', error);
    throw error;
  }
}

/**
 * Создать профиль исполнителя
 */
export async function createFreelancerProfile(
  data: FreelancerProfileCreate
): Promise<FreelancerProfile> {
  try {
    return await api.post('/api/market/freelancers', data);
  } catch (error: any) {
    console.error('Failed to create freelancer profile:', error);
    throw error;
  }
}

// ================== Reviews ==================

/**
 * Создать отзыв
 */
export async function createMarketReview(data: MarketReviewCreate): Promise<MarketReview> {
  try {
    return await api.post('/api/market/reviews', data);
  } catch (error: any) {
    console.error('Failed to create review:', error);
    throw error;
  }
}

/**
 * Получить список отзывов
 */
export async function getMarketReviews(
  itemType: string,
  itemId: number,
  params?: { page?: number; page_size?: number }
): Promise<MarketReview[]> {
  try {
    return await api.get('/api/market/reviews', {
      item_type: itemType,
      item_id: itemId,
      ...params,
    });
  } catch (error: any) {
    console.error('Failed to fetch reviews:', error);
    throw error;
  }
}
