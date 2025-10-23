/**
 * Marketplace component stub
 */

import React, { useState, useEffect } from 'react';

interface MarketplaceProps {
  // Add props if needed
}

export default function Marketplace({}: MarketplaceProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);

  return (
    <div className="marketplace">
      <h1>Marketplace</h1>
      <div className="templates">
        {templates.map((t) => (
          <div key={t.id} className="template-card">
            <h2 className="text-lg font-semibold">{t.name}</h2>
            <p>Категория: {t.category}</p>
            <p>⭐ {t.average_rating?.toFixed(1) ?? "0.0"}</p>
            <button
              onClick={() => window.location.href = `/template/${t.id}`}
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
