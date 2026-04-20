import React from 'react';

interface CardProps {
  children: React.ReactNode;
  padding?: string;
  hoverable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
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
  className = '',
}: CardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    background: 'rgba(26, 34, 56, 0.9)',
    border: '1px solid rgba(255, 210, 76, 0.2)',
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
      className={className || undefined}
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </div>
  );
}
