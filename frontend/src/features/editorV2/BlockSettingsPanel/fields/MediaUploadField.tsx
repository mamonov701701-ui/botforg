import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, X, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadMedia } from '../../../../api/media';

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверка типа файла
    const validTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/webp'],
      gif: ['image/gif'],
      video: ['video/mp4', 'video/mpeg', 'video/quicktime'],
    };

    const allowedTypes = validTypes[mediaType] || [];
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      setUploadError(`Неподдерживаемый тип файла: ${file.type}`);
      return;
    }

    // Проверка размера (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Файл слишком большой. Максимум: 50MB');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const result = await uploadMedia(file);
      // Формируем полный URL
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
      const fullUrl = `${API_URL}${result.url}`;
      onChange(fullUrl);
      setUploadError(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.response?.data?.detail || 'Ошибка загрузки файла');
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

  if (mediaSource === 'url') {
    // Режим ввода URL
    return (
      <div style={{ width: '100%' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={urlInput}
            onChange={handleUrlChange}
            placeholder="https://example.com/image.jpg"
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

  // Режим загрузки файла
  return (
    <div style={{ width: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept={
          mediaType === 'image'
            ? 'image/jpeg,image/png,image/webp'
            : mediaType === 'gif'
              ? 'image/gif'
              : mediaType === 'video'
                ? 'video/mp4,video/mpeg,video/quicktime'
                : '*'
        }
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {!value ? (
        // Кнопка выбора файла
        <button
          onClick={() => fileInputRef.current?.click()}
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
        // Показываем загруженный файл
        <div
          style={{
            padding: 12,
            border: '1px solid #22c55e',
            borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
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
              {value}
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
