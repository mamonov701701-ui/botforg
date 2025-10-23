import api from '@/api/client';

interface Template {
  id: string;
  name: string;
  is_public: boolean;
  [key: string]: any;
}

interface TemplatesResponse {
  items: Template[];
  total: number;
}

export async function getMyTemplates(): Promise<TemplatesResponse> {
  return api.get('/templates/my');
}

export async function createTemplate(data: Partial<Template>): Promise<Template> {
  return api.post('/templates', data);
}

export async function deleteTemplate(id: string | number): Promise<void> {
  return api.delete(`/templates/${id}`);
}

export async function publishTemplate(id: string | number, data?: any): Promise<Template> {
  return api.post(`/templates/${id}/publish`, data || {});
}

export async function getTemplateContent(id: string | number): Promise<any> {
  return api.get(`/templates/${id}/content`);
}

export async function saveTemplateContent(id: string | number, content: any): Promise<any> {
  return api.put(`/templates/${id}/content`, content);
}
