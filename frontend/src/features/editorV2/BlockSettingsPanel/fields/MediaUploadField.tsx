import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, X, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadMedia } from '../../../../api/media';
import { apiOrigin } from '../../../../api/devApiOrigin';

interface MediaUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  error?: string;
  mediaSource?: 'upload' | 'url';
  mediaType?: 'none' | 'image' | 'gif' | 'video';
}

export const MediaUploadField: React.FC<MediaUploadFieldProps> = ({
  value,
  onChange,
  error,
  mediaSource = 'upload',
  mediaType = 'none',
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState(value || '');

  // Стабильный ID для input, который не меняется при рендерах
  // Используем useMemo чтобы обновлялся при изменении mediaType
  const inputId = React.useMemo(
    () => `media-upload-${mediaType}-${Math.random().toString(36).substr(2, 9)}`,
    [mediaType]
  );

  // Проверка, что ref установлен после монтирования (только в dev режиме)
  React.useEffect(() => {
    if (import.meta.env.DEV && mediaSource !== 'url' && !fileInputRef.current) {
      console.error('File input ref not set in upload mode!');
    }
  }, [mediaSource]);

  // Синхронизируем urlInput с value
  React.useEffect(() => {
    if (mediaSource === 'url') {
      setUrlInput(value || '');
    }
  }, [value, mediaSource]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Проверка типа файла
    const validTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/webp'],
      gif: ['image/gif'],
      video: ['video/mp4', 'video/mpeg', 'video/quicktime'],
    };

    const allowedTypes = validTypes[mediaType] || [];
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      setUploadError(`Неподдерживаемый тип файла: ${file.type}`);
      // Сбрасываем input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Проверка размера (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Файл слишком большой. Максимум: 50MB');
      // Сбрасываем input
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
      onChange(fullUrl);
      setUploadError(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      const errorMessage = err?.message || err?.response?.data?.detail || 'Ошибка загрузки файла';
      setUploadError(errorMessage);
      // Сбрасываем input при ошибке
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrlInput(newUrl);
    onChange(newUrl);
  };

  const handleClear = () => {
    onChange('');
    setUrlInput('');
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Определяем режим: если явно 'url', иначе 'upload' (по умолчанию)
  const isUrlMode = mediaSource === 'url';

  if (isUrlMode) {
    // Режим ввода URL
    return (
      <div style={{ width: '100%' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={urlInput}
            onChange={handleUrlChange}
            placeholder="Ссылка на изображение, напр. https://site.ru/photo.jpg"
            style={{
              width: '100%',
              padding: '10px 36px 10px 12px',
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
          {value && (
            <button
              onClick={handleClear}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
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
              <X size={16} />
            </button>
          )}
        </div>
        {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{error}</div>}
      </div>
    );
  }

  // Режим загрузки файла (по умолчанию или когда mediaSource === 'upload')
  return (
    <div style={{ width: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        id={inputId}
        key={inputId} // Добавляем key для принудительного пересоздания при изменении mediaType
        accept={
          mediaType === 'image'
            ? 'image/jpeg,image/png,image/webp'
            : mediaType === 'gif'
              ? 'image/gif'
              : mediaType === 'video'
                ? 'video/mp4,video/mpeg,video/quicktime'
                : 'image/*,video/*'
        }
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {!value ? (
        // Кнопка для выбора файла - используем прямой вызов click()
        <button
          type="button"
          onClick={e => {
            // Прямой вызов click() на file input
            if (fileInputRef.current) {
              try {
                // Временно делаем input видимым для некоторых браузеров
                const originalDisplay = fileInputRef.current.style.display;
                fileInputRef.current.style.display = 'block';
                fileInputRef.current.style.position = 'absolute';
                fileInputRef.current.style.opacity = '0';
                fileInputRef.current.style.width = '1px';
                fileInputRef.current.style.height = '1px';

                fileInputRef.current.click();

                // Возвращаем скрытие
                setTimeout(() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.style.display = originalDisplay;
                    fileInputRef.current.style.position = '';
                    fileInputRef.current.style.opacity = '';
                    fileInputRef.current.style.width = '';
                    fileInputRef.current.style.height = '';
                  }
                }, 100);
              } catch (err) {
                if (import.meta.env.DEV) {
                  console.error('Error clicking file input:', err);
                }
              }
            } else {
              // Запасной вариант через getElementById
              const inputElement = document.getElementById(inputId);
              if (inputElement) {
                try {
                  (inputElement as HTMLInputElement).click();
                } catch (err) {
                  if (import.meta.env.DEV) {
                    console.error('Error clicking input element:', err);
                  }
                }
              }
            }
          }}
          disabled={uploading}
          style={{
            width: '100%',
            padding: '12px 16px',
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
            userSelect: 'none',
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
          <Upload size={16} />
          {uploading ? 'Загрузка...' : 'Выбрать файл'}
        </button>
      ) : (
        // Показываем загруженный файл с превью
        <div
          style={{
            padding: 12,
            border: '1px solid #22c55e',
            borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle size={20} color="#22c55e" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#22c55e',
                  marginBottom: 4,
                }}
              >
                Файл загружен
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={value}
              >
                {value.split('/').pop() || value}
              </div>
            </div>
            <button
              onClick={handleClear}
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
              <X size={16} />
            </button>
          </div>

          {/* Превью изображения */}
          {(mediaType === 'image' || mediaType === 'gif') && value && (
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
                src={value}
                alt="Превью"
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '200px',
                  objectFit: 'contain',
                  display: 'block',
                }}
                onError={e => {
                  // Если изображение не загрузилось, скрываем превью
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Для видео показываем иконку */}
          {mediaType === 'video' && value && (
            <div
              style={{
                width: '100%',
                height: '120px',
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                background: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: 48,
                  color: '#22c55e',
                  opacity: 0.5,
                }}
              >
                ▶
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  right: 8,
                  fontSize: 10,
                  color: '#9ca3af',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Видео файл
              </div>
            </div>
          )}
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
