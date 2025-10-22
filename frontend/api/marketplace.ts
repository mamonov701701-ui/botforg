import api from "./client";

export async function getMarketplace(params) {
  const response = await api.get("/marketplace", { params });
  return response.data;
}

export async function getTemplate(id) {
  const response = await api.get(`/marketplace/${id}`);
  return response.data;
}

export async function getTemplateDetail(id) {
  const response = await api.get(`/marketplace/${id}`);
  return response.data;
} 