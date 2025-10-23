import api from "@/api/client";

interface MarketplaceParams {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
  [key: string]: any;
}

export async function getMarketplace(params?: MarketplaceParams): Promise<any> {
  let url = "/marketplace";
  if (params) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return api.get(url);
}

export async function getTemplate(id: string | number): Promise<any> {
  const response = await api.get(`/marketplace/${id}`);
  return response;
}

export async function getTemplateDetail(id: string | number): Promise<any> {
  const response = await api.get(`/marketplace/${id}`);
  return response;
} 