"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTemplateDetail } from "@/api/marketplace";
import RatingStars from "@/components/RatingStars";
import CommentList from "@/components/CommentList";
import PurchaseButtons from "@/components/PurchaseButtons";

export default function TemplatePage() {
  const params = useParams();
  const [template, setTemplate] = useState(null);

  useEffect(() => {
    if (params?.id) {
      getTemplateDetail(+params.id).then(setTemplate);
    }
  }, [params]);

  if (!template) return <div className="p-4">Загрузка...</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">{template.name}</h1>
      <p className="text-muted-foreground">{template.category}</p>
      <div className="flex items-center gap-2">
        <RatingStars rating={template.average_rating} templateId={template.id} ratingCount={template.rating_count} />
        <span className="text-sm text-gray-500">({template.rating_count})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {template.tags?.map((tag) => (
          <span key={tag.id} className="bg-gray-100 px-2 py-1 rounded text-xs">{tag.name}</span>
        ))}
      </div>
      {template.description && <p className="text-base mt-2">{template.description}</p>}
      <PurchaseButtons template={template} />
      <CommentList templateId={template.id} comments={template.comments} />
    </div>
  );
} 