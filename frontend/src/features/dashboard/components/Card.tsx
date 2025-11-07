import React from 'react';

interface CardProps {
  children: React.ReactNode;
  padding?: string;
  hoverable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Базовая карточка для контента
 */
export default function Card({
  children,
  padding = '24px',
  hoverable = false,
  onClick,
  style = {},
}: CardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding,
    transition: 'all 0.2s',
    ...style,
  };

  if (hoverable || onClick) {
    baseStyle.cursor = 'pointer';
    if (isHovered) {
      baseStyle.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
      baseStyle.transform = 'translateY(-2px)';
    }
  }

  return (
    <div
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </div>
  );
}
