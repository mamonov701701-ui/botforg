import React, { useState } from "react";
import { Star } from "lucide-react"; // или любую другую иконку звезды
import api from "@/api/client";

interface RatingStarsProps {
  templateId: number;
  initialRating: number;
  isOwner: boolean;
  userHasRated: boolean;
  ratingCount?: number;
}

export default function RatingStars({
  templateId,
  initialRating,
  isOwner,
  userHasRated,
  ratingCount = 0,
}: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [userRated, setUserRated] = useState(userHasRated);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avg, setAvg] = useState(initialRating);
  const [count, setCount] = useState(ratingCount);

  if (isOwner) return null;

  const handleRate = async (score: number) => {
    if (userRated || loading) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/ratings", { template_id: templateId, score });
      setUserRated(true);
      setAvg(((avg * count + score) / (count + 1)));
      setCount(count + 1);
    } catch (e) {
      setError("Ошибка при отправке оценки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">Средняя оценка: {avg?.toFixed(1) ?? "-"}</span>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={userRated || loading}
            onClick={() => handleRate(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className="p-0.5"
            title={userRated ? "Вы уже оценили" : `Поставить ${star} звёзд`}
          >
            <Star
              size={20}
              fill={
                (hovered !== null ? star <= hovered : star <= Math.round(avg))
                  ? "#facc15"
                  : "none"
              }
              stroke="#facc15"
              style={{ opacity: userRated ? 0.7 : 1, transition: "fill 0.2s" }}
            />
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500">({count} голосов)</span>
      {loading && <span className="text-xs text-blue-500 ml-2">Сохраняем...</span>}
      {userRated && <span className="text-xs text-green-600 ml-2">Спасибо за вашу оценку!</span>}
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </div>
  );
} 