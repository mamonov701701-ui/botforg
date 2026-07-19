import React from 'react';
import '../styles/shell.css';

export interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  padding?: string | number;
}

/** Inner content block — slightly more transparent than page shell. */
export default function SectionCard({
  children,
  className = '',
  style,
  testId = 'bf-section-card',
  padding,
}: SectionCardProps) {
  return (
    <div
      data-testid={testId}
      className={`bf-section-card ${className}`.trim()}
      style={padding != null ? { padding, ...style } : style}
    >
      {children}
    </div>
  );
}
