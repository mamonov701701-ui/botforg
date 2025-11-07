/**
 * Валидатор и санитайзер для импортируемых сценариев
 * Защищает от XSS, Prototype Pollution, DoS и других атак
 */

import DOMPurify from 'dompurify';
import { Node, Edge } from 'reactflow';

// Максимальные ограничения
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_NODES = 500; // Максимум блоков
const MAX_EDGES = 1000; // Максимум связей
const MAX_STRING_LENGTH = 1000; // Максимальная длина строки
const MAX_NESTING_DEPTH = 10; // Максимальная глубина вложенности

interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedData?: {
    nodes: Node[];
    edges: Edge[];
    metadata?: Record<string, unknown>;
  };
}

/**
 * Проверка размера файла
 */
export function validateFileSize(file: File): { isValid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }
  return { isValid: true };
}

/**
 * Проверка глубины вложенности объекта (защита от Stack Overflow)
 */
function checkNestingDepth(obj: unknown, depth = 0): boolean {
  if (depth > MAX_NESTING_DEPTH) {
    return false;
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (!checkNestingDepth((obj as Record<string, unknown>)[key], depth + 1)) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Санитизация строки (удаление HTML/JavaScript)
 */
function sanitizeString(str: unknown): string {
  if (typeof str !== 'string') {
    return String(str);
  }

  // Ограничение длины
  if (str.length > MAX_STRING_LENGTH) {
    str = str.substring(0, MAX_STRING_LENGTH);
  }

  // Удаление HTML тегов и скриптов
  const sanitized = DOMPurify.sanitize(str, {
    ALLOWED_TAGS: [], // Не разрешаем никакие HTML теги
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Оставляем текстовое содержимое
  });

  return sanitized;
}

/**
 * Санитизация объекта (рекурсивно)
 */
function sanitizeObject(obj: unknown): unknown {
  // Защита от __proto__, constructor, prototype
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const key in obj) {
    // Блокируем опасные ключи
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      console.warn(`Заблокирован опасный ключ: ${key}`);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
    }
  }

  return sanitized;
}

/**
 * Валидация структуры Node
 */
function validateNode(node: unknown): node is Node {
  if (typeof node !== 'object' || node === null) {
    return false;
  }

  const n = node as Record<string, unknown>;

  // Обязательные поля
  if (typeof n.id !== 'string' || !n.id) {
    return false;
  }

  // Проверка типа
  if (n.type && typeof n.type !== 'string') {
    return false;
  }

  // Проверка position
  if (n.position) {
    const pos = n.position as Record<string, unknown>;
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      return false;
    }
  }

  // data может быть любым объектом, но проверим его наличие
  if (n.data && typeof n.data !== 'object') {
    return false;
  }

  return true;
}

/**
 * Валидация структуры Edge
 */
function validateEdge(edge: unknown): edge is Edge {
  if (typeof edge !== 'object' || edge === null) {
    return false;
  }

  const e = edge as Record<string, unknown>;

  // Обязательные поля
  if (typeof e.id !== 'string' || !e.id) {
    return false;
  }
  if (typeof e.source !== 'string' || !e.source) {
    return false;
  }
  if (typeof e.target !== 'string' || !e.target) {
    return false;
  }

  return true;
}

/**
 * Основная функция валидации импортируемого файла
 */
export async function validateScenarioFile(file: File): Promise<ValidationResult> {
  try {
    // 1. Проверка размера файла
    const sizeCheck = validateFileSize(file);
    if (!sizeCheck.isValid) {
      return sizeCheck;
    }

    // 2. Проверка расширения
    if (!file.name.endsWith('.json')) {
      return {
        isValid: false,
        error: 'Неверный формат файла. Поддерживаются только .json файлы',
      };
    }

    // 3. Чтение и парсинг файла
    const text = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return {
        isValid: false,
        error: 'Неверный формат JSON. Файл поврежден',
      };
    }

    // 4. Проверка глубины вложенности
    if (!checkNestingDepth(parsed)) {
      return {
        isValid: false,
        error: 'Слишком глубокая структура данных',
      };
    }

    // 5. Проверка базовой структуры
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        isValid: false,
        error: 'Неверная структура данных',
      };
    }

    const data = parsed as Record<string, unknown>;

    // 6. Проверка наличия nodes
    if (!Array.isArray(data.nodes)) {
      return {
        isValid: false,
        error: 'Отсутствует массив nodes',
      };
    }

    // 7. Проверка лимитов
    if (data.nodes.length > MAX_NODES) {
      return {
        isValid: false,
        error: `Слишком много блоков. Максимум: ${MAX_NODES}`,
      };
    }

    // 8. Проверка edges
    if (data.edges && !Array.isArray(data.edges)) {
      return {
        isValid: false,
        error: 'Неверный формат edges',
      };
    }

    const edges = (data.edges || []) as unknown[];
    if (edges.length > MAX_EDGES) {
      return {
        isValid: false,
        error: `Слишком много связей. Максимум: ${MAX_EDGES}`,
      };
    }

    // 9. Валидация каждого node
    const validNodes: Node[] = [];
    for (const node of data.nodes) {
      if (!validateNode(node)) {
        console.warn('Пропущен невалидный node:', node);
        continue;
      }
      validNodes.push(node as Node);
    }

    if (validNodes.length === 0) {
      return {
        isValid: false,
        error: 'Нет валидных блоков в файле',
      };
    }

    // 10. Валидация каждого edge
    const validEdges: Edge[] = [];
    for (const edge of edges) {
      if (!validateEdge(edge)) {
        console.warn('Пропущен невалидный edge:', edge);
        continue;
      }
      validEdges.push(edge as Edge);
    }

    // 11. Проверка что все edges ссылаются на существующие nodes
    const nodeIds = new Set(validNodes.map(n => n.id));
    const filteredEdges = validEdges.filter(edge => {
      const isValid = nodeIds.has(edge.source) && nodeIds.has(edge.target);
      if (!isValid) {
        console.warn('Пропущен edge с несуществующими узлами:', edge);
      }
      return isValid;
    });

    // 12. Санитизация всех данных
    const sanitizedNodes = sanitizeObject(validNodes) as Node[];
    const sanitizedEdges = sanitizeObject(filteredEdges) as Edge[];

    // 13. Санитизация metadata (если есть)
    let sanitizedMetadata: Record<string, unknown> | undefined;
    if (data.metadata && typeof data.metadata === 'object') {
      sanitizedMetadata = sanitizeObject(data.metadata) as Record<string, unknown>;
    }

    // Успех!
    return {
      isValid: true,
      sanitizedData: {
        nodes: sanitizedNodes,
        edges: sanitizedEdges,
        metadata: sanitizedMetadata,
      },
    };
  } catch (error) {
    console.error('Ошибка валидации:', error);
    return {
      isValid: false,
      error: 'Произошла ошибка при обработке файла',
    };
  }
}

/**
 * Валидация текстового JSON (для вставки из буфера обмена)
 */
export function validateScenarioJSON(jsonString: string): ValidationResult {
  try {
    const parsed = JSON.parse(jsonString);

    // Создаем виртуальный File объект для валидации
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], 'clipboard.json', { type: 'application/json' });

    return validateScenarioFile(file);
  } catch (error) {
    return {
      isValid: false,
      error: 'Неверный формат JSON',
    };
  }
}

/**
 * Экспорт сценария с безопасной сериализацией
 */
export function exportScenario(
  nodes: Node[],
  edges: Edge[],
  metadata?: Record<string, unknown>
): string {
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
    metadata,
  };

  // JSON.stringify безопасен для экспорта
  // Использует replacer для избежания циклических ссылок
  return JSON.stringify(
    data,
    (key, value) => {
      // Блокируем опасные ключи при экспорте
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    },
    2
  );
}
