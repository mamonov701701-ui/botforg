/**
 * Template Reviews component stub
 */

import React from 'react';

interface TemplateReviewsProps {
  templateId: string | number;
  canReview?: boolean;
}

export default function TemplateReviews({ templateId, canReview }: TemplateReviewsProps) {
  return (
    <div className="template-reviews">
      <h3>Reviews</h3>
      {canReview && <button>Write a Review</button>}
      <p>No reviews yet.</p>
    </div>
  );
}
