/**
 * Template Page component stub
 */

import React, { useState, useEffect } from 'react';

interface TemplatePageProps {
  templateId: string | number;
}

export default function TemplatePage({ templateId }: TemplatePageProps) {
  const [template, setTemplate] = useState<any>(null);

  if (!template) return <div>Loading...</div>;

  return (
    <div className="template-page">
      <h1 className="text-2xl font-bold">{template.name}</h1>
      <p className="text-muted-foreground">{template.category}</p>
      <div>
        <span>⭐ {template.average_rating?.toFixed(1)}</span>
        <span className="text-sm text-gray-500">({template.rating_count})</span>
      </div>
      {template.tags?.map((tag: any) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
      {template.description && <p className="text-base mt-2">{template.description}</p>}
    </div>
  );
}
