import React from 'react';
import { Eye, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DemoModeBannerProps {
  /** Краткое описание ограничения */
  message?: string;
  /** Компактный режим (меньше высота) */
  compact?: boolean;
  /** Ссылка для CTA (по умолчанию /pricing) */
  upgradeUrl?: string;
}

/**
 * Баннер демо-режима: "Просмотр без возможности редактирования" + CTA.
 */
export default function DemoModeBanner({
  message = 'Просмотр без возможности редактирования',
  compact = false,
  upgradeUrl = '/pricing',
}: DemoModeBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: compact ? '10px 16px' : '14px 20px',
        background: 'linear-gradient(135deg, rgba(255, 210, 76, 0.15), rgba(255, 210, 76, 0.05))',
        border: '1px solid rgba(255, 210, 76, 0.4)',
        borderRadius: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            padding: '8px',
            background: 'rgba(255, 210, 76, 0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Eye size={compact ? 18 : 22} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <div
            style={{
              fontSize: compact ? '13px' : '14px',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Демо-режим
          </div>
          <div
            style={{
              fontSize: compact ? '12px' : '13px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            {message}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Link
          to={upgradeUrl}
          style={{
            fontSize: compact ? '12px' : '13px',
            color: 'var(--primary)',
            textDecoration: 'none',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          Обновить тариф
        </Link>
        <Link
          to={upgradeUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: compact ? '8px 16px' : '10px 20px',
            background: 'var(--primary)',
            color: '#000',
            borderRadius: '8px',
            fontSize: compact ? '13px' : '14px',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--primary-hover)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Zap size={16} />
          Получить полный доступ
        </Link>
      </div>
    </div>
  );
}
