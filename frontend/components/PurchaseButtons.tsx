import React, { useState } from "react";
import {
  payWithTelegram,
  payWithYooKassa,
  payWithStripe,
  payWithCloud,
} from "@/api/payment";
import { Button } from "@/components/ui/button";
// import { toast } from "react-hot-toast"; // если используете react-hot-toast

interface PurchaseButtonsProps {
  templateId: number;
  price: number; // в рублях
  isPurchased: boolean;
}

export default function PurchaseButtons({ templateId, price, isPurchased }: PurchaseButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (isPurchased) {
    return <div className="text-green-600 font-semibold">✅ Шаблон куплен. Спасибо за покупку!</div>;
  }

  const handlePay = async (method: string) => {
    setLoading(method);
    try {
      if (method === "telegram") {
        const invoice = await payWithTelegram(templateId);
        // Для Telegram WebApp: window.Telegram.WebApp.openInvoice(invoice)
        alert("Инвойс для Telegram: " + JSON.stringify(invoice));
      } else if (method === "yookassa") {
        const url = await payWithYooKassa(templateId);
        window.location.href = url;
      } else if (method === "stripe") {
        const url = await payWithStripe(templateId);
        window.location.href = url;
      } else if (method === "cloud") {
        const invoice = await payWithCloud(templateId);
        alert("Инвойс для СБП: " + JSON.stringify(invoice));
      }
    } catch (e) {
      // toast.error("Ошибка оплаты. Попробуйте другой способ.");
      alert("Ошибка оплаты. Попробуйте другой способ.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="font-medium mb-1">Цена: {price} ₽</div>
      <Button
        onClick={() => handlePay("telegram")}
        disabled={!!loading}
        className="bg-[#229ED9] hover:bg-[#229ED9]/90"
      >
        {loading === "telegram" ? "Ожидание Telegram..." : "Оплатить через Telegram"}
      </Button>
      <Button
        onClick={() => handlePay("yookassa")}
        disabled={!!loading}
        className="bg-[#FFCC00] hover:bg-[#FFCC00]/90 text-black"
      >
        {loading === "yookassa" ? "Переход к ЮKassa..." : "Оплатить через ЮKassa"}
      </Button>
      <Button
        onClick={() => handlePay("stripe")}
        disabled={!!loading}
        className="bg-[#635BFF] hover:bg-[#635BFF]/90"
      >
        {loading === "stripe" ? "Переход к Stripe..." : "Оплатить через Stripe"}
      </Button>
      <Button
        onClick={() => handlePay("cloud")}
        disabled={!!loading}
        className="bg-[#00B341] hover:bg-[#00B341]/90"
      >
        {loading === "cloud" ? "Переход к СБП..." : "Оплатить через СБП (CloudPayments)"}
      </Button>
    </div>
  );
} 