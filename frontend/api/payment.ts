import api from "@/api/client";

export async function payWithTelegram(templateId: string | number): Promise<any> {
  const response = await api.post("/payments/telegram-invoice", { template_id: templateId });
  return response; // invoice_data для Telegram
}

export async function payWithYooKassa(templateId: string | number): Promise<string> {
  const response = await api.post("/payments/yookassa", { template_id: templateId });
  return response.confirmation_url;
}

export async function payWithStripe(templateId: string | number): Promise<string> {
  const response = await api.post("/payments/stripe", { template_id: templateId });
  return response.session_url;
}

export async function payWithCloud(templateId: string | number): Promise<any> {
  const response = await api.post("/payments/cloudpayments", { template_id: templateId });
  return response; // invoice data
} 