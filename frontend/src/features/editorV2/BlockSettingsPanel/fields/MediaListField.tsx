import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { uploadMedia } from '../../../../api/media';
import { apiOrigin } from '../../../../api/devApiOrigin';
import {
  fileInputAcceptForMessageMedia,
  fileMatchesDeclaredMessageMedia,
  inferMessageMediaKindFromFile,
  inferMessageMediaKindFromUrl,
  messageMediaItemMatchesDeclared,
} from '../../../../utils/messageMedia';

interface MediaItem {
  url: string;
  type: 'image' | 'gif' | 'video';
  source: 'upload' | 'url';
  fileName?: string;
}

interface MediaListFieldProps {
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  error?: string;
  mediaType?: 'none' | 'image' | 'gif' | 'video';
  /** Скрыть серый блок «один тип на весь блок» (подсказка уже выше по форме) */
  hideScopeHint?: boolean;
  /** Плоский UI: без «карточек», компактный переключатель файл / URL */
  variant?: 'default' | 'compact';
}

export const MediaListField: React.FC<MediaListFieldProps> = ({
  value,
  onChange,
  error,
  mediaType = 'none',
  hideScopeHint = false,
  variant = 'default',
}) => {
  const compact = variant === 'compact';
  // Убеждаемся, что value всегда массив
  const mediaList = Array.isArray(value) ? value : value === null || value === undefined ? [] : [];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentSource, setCurrentSource] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputId = React.useMemo(
    () => `media-list-upload-${Math.random().toString(36).substr(2, 9)}`,
    []
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (mediaType && mediaType !== 'none' && !fileMatchesDeclaredMessageMedia(mediaType, file)) {
      const label =
        mediaType === 'image'
          ? 'JPEG, PNG или WebP'
          : mediaType === 'gif'
            ? 'GIF'
            : 'MP4, WebM, QuickTime или MPEG';
      setUploadError(
        `Файл не соответствует выбранному типу «${mediaType}». Ожидается: ${label}. Получено: ${file.type || 'неизвестный тип'}`
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const detectedType = inferMessageMediaKindFromFile(file);

    // Проверка размера (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Файл слишком большой. Максимум: 50MB');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const result = await uploadMedia(file);
      const origin = apiOrigin();
      const fullUrl = result.url.startsWith('http')
        ? result.url
        : `${origin}${result.url.startsWith('/') ? '' : '/'}${result.url}`;

      const itemType = mediaType && mediaType !== 'none' ? mediaType : detectedType;
      const newItem: MediaItem = {
        url: fullUrl,
        type: itemType,
        source: 'upload',
        fileName: result.fileName,
      };

      onChange([...mediaList, newItem]);
      setUploadError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      const errorMessage = err?.message || err?.response?.data?.detail || 'Ошибка загрузки файла';
      setUploadError(errorMessage);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) {
      return;
    }

    const trimmed = urlInput.trim();
    const detectedType = inferMessageMediaKindFromUrl(trimmed);

    if (
      mediaType &&
      mediaType !== 'none' &&
      !messageMediaItemMatchesDeclared(mediaType, detectedType)
    ) {
      if (mediaType === 'video') {
        setUploadError('Для видео укажите прямую ссылку на файл (.mp4, .webm, .mov и т.п.).');
      } else if (mediaType === 'gif') {
        setUploadError('Для GIF укажите ссылку на .gif или загрузите GIF-файл.');
      } else {
        setUploadError(
          'Для картинки нужна ссылка на изображение (не GIF и не видео), либо смените тип медиа.'
        );
      }
      return;
    }

    const itemType = mediaType && mediaType !== 'none' ? mediaType : detectedType;
    const newItem: MediaItem = {
      url: trimmed,
      type: itemType,
      source: 'url',
    };

    onChange([...mediaList, newItem]);
    setUrlInput('');
    setUploadError(null);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = mediaList.filter((_, i) => i !== index);
    onChange(newItems);
  };

  const handleClearUrl = () => {
    setUrlInput('');
  };

  return (
    <div style={{ width: '100%' }}>
      {error && (
        <div
          style={{
            marginBottom: compact ? 8 : 10,
            padding: compact ? '6px 8px' : '8px 10px',
            background: compact ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.12)',
            border: compact ? 'none' : '1px solid rgba(239, 68, 68, 0.45)',
            borderLeft: compact ? '3px solid #ef4444' : undefined,
            borderRadius: compact ? 4 : 8,
            fontSize: 11,
            color: '#fecaca',
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      {mediaType && mediaType !== 'none' && !hideScopeHint && (
        <div
          style={{
            fontSize: 11,
            color: '#94a3b8',
            marginBottom: 12,
            lineHeight: 1.45,
            padding: '8px 10px',
            background: 'rgba(51, 65, 85, 0.35)',
            borderRadius: 8,
            border: '1px solid rgba(71, 85, 105, 0.5)',
          }}
        >
          <strong style={{ color: '#e2e8f0' }}>Один тип на весь блок.</strong> Тип медиа выбирается
          выше и действует на все вложения. Здесь можно добавлять только{' '}
          {mediaType === 'image'
            ? 'изображения (JPEG, PNG, WebP)'
            : mediaType === 'gif'
              ? 'GIF'
              : 'видео (MP4, WebM, QuickTime и т.п.)'}
          . Смешанные типы в одном сообщении не поддерживаются.
        </div>
      )}

      {/* Переключатель источника */}
      {compact ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            id={inputId}
            accept={
              mediaType && mediaType !== 'none'
                ? fileInputAcceptForMessageMedia(mediaType)
                : 'image/*,video/*'
            }
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid #475569',
              borderRadius: 6,
              background: '#1e293b',
              color: '#e2e8f0',
              cursor: uploading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Upload size={15} />
            {uploading ? 'Загрузка…' : 'Добавить файл'}
          </button>
          <button
            type="button"
            onClick={() => setCurrentSource(currentSource === 'url' ? 'upload' : 'url')}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 0',
              fontSize: 12,
              color: currentSource === 'url' ? '#60a5fa' : '#6b7280',
              cursor: 'pointer',
              textDecoration: currentSource === 'url' ? 'underline' : 'none',
            }}
          >
            По ссылке
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            padding: 4,
            background: '#1f2937',
            borderRadius: 6,
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentSource('upload')}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              background: currentSource === 'upload' ? '#3b82f6' : 'transparent',
              color: currentSource === 'upload' ? '#fff' : '#9ca3af',
              transition: 'all 0.2s ease',
            }}
          >
            <Upload
              size={14}
              style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }}
            />
            Загрузить
          </button>
          <button
            type="button"
            onClick={() => setCurrentSource('url')}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              background: currentSource === 'url' ? '#3b82f6' : 'transparent',
              color: currentSource === 'url' ? '#fff' : '#9ca3af',
              transition: 'all 0.2s ease',
            }}
          >
            <LinkIcon
              size={14}
              style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }}
            />
            URL
          </button>
        </div>
      )}

      {/* Поле для добавления нового медиа (режим «классический») */}
      {!compact && currentSource === 'upload' && (
        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            id={inputId}
            accept={
              mediaType && mediaType !== 'none'
                ? fileInputAcceptForMessageMedia(mediaType)
                : 'image/*,video/*'
            }
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              border: error ? '2px dashed #ef4444' : '2px dashed #3b82f6',
              borderRadius: 8,
              background: uploading ? '#1e293b' : 'transparent',
              color: error ? '#ef4444' : '#3b82f6',
              cursor: uploading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              opacity: uploading ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (!uploading && !error) {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
              }
            }}
            onMouseLeave={e => {
              if (!uploading) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <Plus size={16} />
            {uploading ? 'Загрузка...' : 'Добавить файл'}
          </button>
        </div>
      )}
      {!compact && currentSource === 'url' && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter') {
                handleAddUrl();
              }
            }}
            placeholder="Ссылка на изображение, напр. https://site.ru/photo.jpg"
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: 13,
              border: error ? '1px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: 6,
              background: '#1e293b',
              color: '#e5e7eb',
              outline: 'none',
              transition: 'border 0.2s ease',
            }}
            onFocus={e => {
              if (!error) e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onBlur={e => {
              if (!error) e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          />
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={!urlInput.trim()}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              borderRadius: 6,
              background: urlInput.trim() ? '#3b82f6' : '#374151',
              color: '#fff',
              cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={16} />
            Добавить
          </button>
        </div>
      )}
      {compact && currentSource === 'url' && (
        <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter') {
                handleAddUrl();
              }
            }}
            placeholder="https://…"
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 13,
              border: error ? '1px solid #ef4444' : '1px solid #475569',
              borderRadius: 6,
              background: '#0f172a',
              color: '#e5e7eb',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={!urlInput.trim()}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              borderRadius: 6,
              background: urlInput.trim() ? '#3b82f6' : '#374151',
              color: '#fff',
              cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Добавить
          </button>
        </div>
      )}

      {/* Список добавленных медиа */}
      {mediaList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 0 : 8 }}>
          {mediaList.map((item, index) => (
            <div
              key={index}
              style={
                compact
                  ? {
                      padding: '8px 0',
                      borderBottom: '1px solid #334155',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }
                  : {
                      padding: 12,
                      border: '1px solid #22c55e',
                      borderRadius: 8,
                      background: 'rgba(34, 197, 94, 0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckCircle size={16} color={compact ? '#64748b' : '#22c55e'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9ca3af',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.url}
                  >
                    {item.fileName || item.url.split('/').pop() || 'Медиа'}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#6b7280',
                      marginTop: 2,
                    }}
                  >
                    {item.type === 'image'
                      ? '📷 Изображение'
                      : item.type === 'gif'
                        ? '🎬 GIF'
                        : '🎥 Видео'}{' '}
                    • {item.source === 'upload' ? 'Загружено' : 'URL'}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveItem(index)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Превью */}
              {(item.type === 'image' || item.type === 'gif') && (
                <div
                  style={{
                    width: '100%',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: compact ? '1px solid #334155' : '1px solid rgba(34, 197, 94, 0.3)',
                    background: '#1e293b',
                  }}
                >
                  <img
                    src={item.url}
                    alt={`Медиа ${index + 1}`}
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: compact ? 100 : 150,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {item.type === 'video' && (
                <div
                  style={{
                    width: '100%',
                    height: compact ? 72 : 100,
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: compact ? '1px solid #334155' : '1px solid rgba(34, 197, 94, 0.3)',
                    background: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: compact ? 24 : 32,
                      color: compact ? '#64748b' : '#22c55e',
                      opacity: 0.5,
                    }}
                  >
                    ▶
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadError && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            fontSize: 11,
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <AlertCircle size={14} />
          {uploadError}
        </div>
      )}
    </div>
  );
};
