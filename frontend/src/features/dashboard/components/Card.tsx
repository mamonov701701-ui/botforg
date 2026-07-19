import React from 'react';
import '../../../styles/shell.css';

interface CardProps {
  children: React.ReactNode;
  padding?: string;
  hoverable?: boolean;
  onClick?: () => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Базовая карточка для контента (section surface).
 */
export default function Card({
  children,
  padding = '24px',
  hoverable = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style = {},
  className = '',
}: CardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    background: 'var(--bf-section-bg)',
    border: '1px solid var(--bf-section-border)',
    borderRadius: 'var(--bf-section-radius)',
    padding,
    transition: 'all 0.2s',
    ...style,
  };

  if (hoverable || onClick) {
    baseStyle.cursor = 'pointer';
    if (isHovered) {
      baseStyle.boxShadow = 'var(--bf-shell-shadow)';
      baseStyle.transform = 'translateY(-2px)';
    }
  }

  return (
    <div
      className={`bf-section-card ${className}`.trim() || undefined}
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={e => {
        setIsHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={e => {
        setIsHovered(false);
        onMouseLeave?.(e);
      }}
    >
      {children}
    </div>
  );
}
