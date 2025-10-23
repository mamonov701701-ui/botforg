/**
 * Rating Stars component stub
 */

import React from 'react';

interface RatingStarsProps {
  rating: number;
  templateId: string | number;
  ratingCount?: number;
}

export default function RatingStars({ rating, templateId, ratingCount }: RatingStarsProps) {
  return (
    <div className="rating-stars">
      <span>⭐ {rating?.toFixed(1) ?? '0.0'}</span>
      {ratingCount && <span> ({ratingCount})</span>}
    </div>
  );
}
