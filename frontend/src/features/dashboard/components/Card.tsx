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
    background: 'var(--color-background-dashboard-card)',
    border: '1px solid var(--color-border-accent-muted)',
    borderRadius: '12px',
    padding,
    transition: 'all 0.2s',
    ...style,
  };

  if (hoverable || onClick) {
    baseStyle.cursor = 'pointer';
    if (isHovered) {
      baseStyle.boxShadow = 'var(--color-shadow-elevated)';
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
