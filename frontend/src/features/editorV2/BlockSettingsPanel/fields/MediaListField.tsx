import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, X, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { uploadMedia } from '../../../../api/media';

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
}

export const MediaListField: React.FC<MediaListFieldProps> = ({
  value,
  onChange,
  error,
  mediaType = 'none',
}) => {
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

    // Определяем тип файла по MIME
    let detectedType: 'image' | 'gif' | 'video' = 'image';
    if (file.type === 'image/gif') {
      detectedType = 'gif';
    } else if (file.type.startsWith('video/')) {
      detectedType = 'video';
    } else if (file.type.startsWith('image/')) {
      detectedType = 'image';
    }

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
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
      const fullUrl = result.url.startsWith('http') ? result.url : `${API_URL}${result.url}`;

      const newItem: MediaItem = {
        url: fullUrl,
        type: detectedType,
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

    // Определяем тип по расширению или оставляем image по умолчанию
    let detectedType: 'image' | 'gif' | 'video' = 'image';
    const urlLower = urlInput.toLowerCase();
    if (urlLower.includes('.gif')) {
      detectedType = 'gif';
    } else if (urlLower.match(/\.(mp4|mpeg|mov|avi|webm)$/)) {
      detectedType = 'video';
    }

    const newItem: MediaItem = {
      url: urlInput.trim(),
      type: detectedType,
      source: 'url',
    };

    onChange([...mediaList, newItem]);
    setUrlInput('');
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
      {/* Переключатель источника */}
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

      {/* Поле для добавления нового медиа */}
      {currentSource === 'upload' ? (
        <div style={{ marginBottom: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            id={inputId}
            accept="image/*,video/*"
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
      ) : (
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

      {/* Список добавленных медиа */}
      {mediaList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mediaList.map((item, index) => (
            <div
              key={index}
              style={{
                padding: 12,
                border: '1px solid #22c55e',
                borderRadius: 8,
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckCircle size={16} color="#22c55e" />
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
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    background: '#1e293b',
                  }}
                >
                  <img
                    src={item.url}
                    alt={`Медиа ${index + 1}`}
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '150px',
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
                    height: '100px',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    background: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontSize: 32, color: '#22c55e', opacity: 0.5 }}>▶</div>
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

      {error && !uploadError && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
};
