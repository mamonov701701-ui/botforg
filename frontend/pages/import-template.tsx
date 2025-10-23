import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { validateFlow } from '@/utils/validateFlow';
import api from '@/api/client';

export default function ImportTemplatePage() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [json, setJson] = useState<any>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setPreview(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        setError('Файл должен содержать массивы nodes и edges');
        return;
      }
      // Простая валидация структуры
      for (const n of data.nodes) {
        if (!n.id || !n.type || !n.data || !n.position) {
          setError('Некорректная структура блока');
          return;
        }
      }
      for (const e of data.edges) {
        if (!e.id || !e.source || !e.target) {
          setError('Некорректная структура связи');
          return;
        }
      }
      // Доп. валидация
      const validation = validateFlow(data.nodes, data.edges);
      if (!validation.valid) {
        setError('Ошибка в шаблоне: ' + (validation.errors[0] || 'Validation failed'));
        return;
      }
      setJson(data);
      setPreview({ nodes: data.nodes, edges: data.edges });
      setStep(2);
    } catch (err) {
      setError('Ошибка чтения файла или формат не JSON');
    }
  };

  const handleImport = async () => {
    if (!json) return;
    setImporting(true);
    setError('');
    try {
      const res = await api.post('/templates/import', json);
      const id = res.data.id;
      router.push(`/edit-template/${id}`);
    } catch {
      setError('Ошибка при импорте шаблона');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-12 p-6 border rounded-xl shadow bg-white">
      <h1 className="text-2xl font-bold mb-6 text-center">Импорт шаблона</h1>
      {step === 1 && (
        <div>
          <input
            type="file"
            accept="application/json"
            ref={inputRef}
            onChange={handleFile}
            className="mb-4"
          />
          <div className="text-gray-500 text-sm mb-2">
            Выберите .json файл, экспортированный из редактора
          </div>
          {error && <div className="text-red-600 mb-2">{error}</div>}
        </div>
      )}
      {step === 2 && preview && (
        <div>
          <div className="mb-4">
            <b>Блоков:</b> {preview.nodes.length} <b>Связей:</b> {preview.edges.length}
          </div>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Импорт...' : 'Импортировать'}
          </button>
          <button
            className="ml-4 px-4 py-2 rounded border"
            onClick={() => {
              setStep(1);
              setPreview(null);
              setFile(null);
              setJson(null);
              setError('');
            }}
          >
            Назад
          </button>
          {error && <div className="text-red-600 mt-2">{error}</div>}
        </div>
      )}
    </div>
  );
}
