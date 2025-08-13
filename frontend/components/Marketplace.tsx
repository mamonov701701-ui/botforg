import React, { useEffect, useState } from "react";
import { getMarketplace } from "@/api/marketplace";
import api from "@/api/client";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { value: "", label: "Все категории" },
  { value: "shop", label: "Магазин" },
  { value: "quiz", label: "Квиз" },
  { value: "restaurant", label: "Ресторан" },
  // ...добавьте свои категории
];

const SORT_FIELDS = [
  { value: "created_at", label: "По дате" },
  { value: "average_rating", label: "По рейтингу" },
];
const SORT_ORDERS = [
  { value: "desc", label: "По убыванию" },
  { value: "asc", label: "По возрастанию" },
];

export default function Marketplace() {
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [limit, setLimit] = useState(9);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/tags").then((res) => setTags(res.data));
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError("");
    try {
      const params: any = {
        limit,
        offset,
        sort_by: sortBy,
        order,
      };
      if (category) params.category = category;
      if (selectedTags.length > 0) params.tags = selectedTags.join(",");
      const data = await getMarketplace(params);
      setTemplates(data.items || data);
      setTotal(data.total || (data.items ? data.items.length : 0));
    } catch (e) {
      setError("Ошибка загрузки шаблонов");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line
  }, [category, selectedTags, sortBy, order, limit, offset]);

  const handleTagChange = (tagId: number) => {
    setOffset(0);
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value);
    setOffset(0);
  };

  const handleSortByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    setOffset(0);
  };

  const handleOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setOrder(e.target.value);
    setOffset(0);
  };

  const handlePrev = () => setOffset((o) => Math.max(0, o - limit));
  const handleNext = () => setOffset((o) => o + limit);

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <div>
          <label className="block text-sm mb-1">Категория</label>
          <select
            value={category}
            onChange={handleCategoryChange}
            className="border rounded px-2 py-1"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Теги</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag: any) => (
              <label key={tag.id} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => handleTagChange(tag.id)}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm mb-1">Сортировка</label>
          <select
            value={sortBy}
            onChange={handleSortByChange}
            className="border rounded px-2 py-1 mr-2"
          >
            {SORT_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={order}
            onChange={handleOrderChange}
            className="border rounded px-2 py-1"
          >
            {SORT_ORDERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mb-2 text-sm text-gray-600">
        Найдено шаблонов: {total}
      </div>
      {loading ? (
        <div className="p-4">Загрузка шаблонов...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : templates.length === 0 ? (
        <div className="text-gray-500">Шаблонов не найдено</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="border rounded-xl p-4 shadow hover:shadow-lg transition"
            >
              <h2 className="text-lg font-semibold">{t.name}</h2>
              <p className="text-sm text-muted-foreground">
                Категория: {t.category}
              </p>
              <p className="text-sm text-yellow-600 font-medium mt-1">
                ⭐ {t.average_rating?.toFixed(1) ?? "0.0"}
              </p>
              <Button
                className="mt-3 w-full"
                onClick={() => window.location.href = `/template/${t.id}`}
              >
                Подробнее
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-6 justify-center">
        <Button onClick={handlePrev} disabled={offset === 0 || loading}>
          Предыдущая
        </Button>
        <Button onClick={handleNext} disabled={offset + limit >= total || loading}>
          Следующая
        </Button>
      </div>
    </div>
  );
} 