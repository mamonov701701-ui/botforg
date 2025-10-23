/**
 * Purchase Buttons component stub
 */

import React from 'react';

interface PurchaseButtonsProps {
  templateId: string | number;
  price?: number;
}

export default function PurchaseButtons({ templateId, price }: PurchaseButtonsProps) {
  return (
    <div className="purchase-buttons">
      <button>Purchase for {price || 'Free'}</button>
    </div>
  );
}
