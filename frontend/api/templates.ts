import api from './client';

export const getMyTemplates = async (params = {}) => {
  const res = await api.get('/my-templates', { params });
  return res.data;
};

export const deleteTemplate = async (id: number) => {
  await api.delete(`/templates/${id}`);
};

export const publishTemplate = async (id: number | string, is_public: boolean) => {
  const res = await api.patch(`/templates/${id}/publish`, { is_public });
  return res.data;
};

export const createTemplate = async (data: any) => {
  const res = await api.post('/templates', data);
  return res.data;
};

export const getTemplateById = async (id: number) => {
  const res = await api.get(`/templates/${id}`);
  return res.data;
};

export const updateTemplate = async (id: number, data: any) => {
  const res = await api.put(`/templates/${id}`, data);
  return res.data;
};

export const updateTemplateTags = async (id: number, tagIds: number[]) => {
  const res = await api.post(`/templates/${id}/tags`, tagIds);
  return res.data;
};

export const getTemplateContent = async (id: number | string) => {
  const res = await api.get(`/templates/${id}`);
  return res.data;
};

export const saveTemplateContent = async (id: number | string, content: any) => {
  const res = await api.post(`/templates/${id}/save`, { content });
  return res.data;
}; 