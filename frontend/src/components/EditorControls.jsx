import React from 'react';
import { 
  Plus, 
  Save, 
  Upload, 
  Download, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader 
} from 'lucide-react';

const EditorControls = ({ 
  onAddBlock, 
  onSave, 
  onExport, 
  onImport, 
  autoSaveStatus, 
  saving 
}) => {
  const getAutoSaveIndicator = () => {
    switch (autoSaveStatus) {
      case 'saving':
        return <span style={{ color: '#f59e0b' }}><Loader className="w-3 h-3 inline mr-1 animate-spin" />Сохранение...</span>;
      case 'saved':
        return <span style={{ color: '#10b981' }}><CheckCircle className="w-3 h-3 inline mr-1" />Сохранено</span>;
      case 'error':
        return <span style={{ color: '#ef4444' }}><XCircle className="w-3 h-3 inline mr-1" />Ошибка</span>;
      default:
        return <span style={{ color: '#6b7280' }}><Clock className="w-3 h-3 inline mr-1" />Ожидание</span>;
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 0, 0, 0.1)'
      }}
    >
      {/* Кнопка добавления блока */}
      <button
        onClick={onAddBlock}
        style={{
          padding: '8px 12px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#2563eb';
          e.target.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = '#3b82f6';
          e.target.style.transform = 'translateY(0)';
        }}
        title="Добавить новый блок"
      >
        <Plus className="w-4 h-4" /> Добавить блок
      </button>

      {/* Кнопка сохранения */}
      <button
        onClick={onSave}
        disabled={saving}
        style={{
          padding: '8px 12px',
          backgroundColor: saving ? '#9ca3af' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          opacity: saving ? 0.6 : 1
        }}
        onMouseEnter={(e) => {
          if (!saving) {
            e.target.style.backgroundColor = '#059669';
            e.target.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => {
          if (!saving) {
            e.target.style.backgroundColor = '#10b981';
            e.target.style.transform = 'translateY(0)';
          }
        }}
        title="Сохранить схему"
      >
        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saving ? 'Сохранение...' : 'Сохранить'}
      </button>

      {/* Кнопка экспорта */}
      <button
        onClick={onExport}
        style={{
          padding: '8px 12px',
          backgroundColor: '#8b5cf6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#7c3aed';
          e.target.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = '#8b5cf6';
          e.target.style.transform = 'translateY(0)';
        }}
        title="Экспортировать схему в JSON"
      >
        <Upload className="w-4 h-4" /> Экспорт
      </button>

      {/* Кнопка импорта */}
      <button
        onClick={onImport}
        style={{
          padding: '8px 12px',
          backgroundColor: '#f59e0b',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#d97706';
          e.target.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = '#f59e0b';
          e.target.style.transform = 'translateY(0)';
        }}
        title="Импортировать схему из JSON"
      >
        <Download className="w-4 h-4" /> Импорт
      </button>

      {/* Индикатор авто-сохранения */}
      <div
        style={{
          padding: '6px 8px',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: '500',
          textAlign: 'center',
          border: '1px solid rgba(0, 0, 0, 0.1)'
        }}
      >
        {getAutoSaveIndicator()}
      </div>
    </div>
  );
};

export default EditorControls;
