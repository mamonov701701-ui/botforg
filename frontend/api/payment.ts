import api from "./client";

export async function payWithTelegram(templateId) {
  const response = await api.post("/payments/telegram-invoice", { template_id: templateId });
  return response.data; // invoice_data для Telegram
}

export async function payWithYooKassa(templateId) {
  const response = await api.post("/payments/yookassa", { template_id: templateId });
  return response.data.confirmation_url;
}

export async function payWithStripe(templateId) {
  const response = await api.post("/payments/stripe", { template_id: templateId });
  return response.data.session_url;
}

export async function payWithCloud(templateId) {
  const response = await api.post("/payments/cloudpayments", { template_id: templateId });
  return response.data; // invoice data
} 