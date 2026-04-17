import type { BlockCatalogItem } from '../types/blocks';

/**
 * Клиентская нормализация каталога:
 * - убираем legacy-блок id=choice
 * - все блоки показываем как «Базовые»
 */
export function mergeClientCatalogBlocks(apiCatalog: BlockCatalogItem[]): BlockCatalogItem[] {
  return apiCatalog
    .filter(b => {
      const id = String(b.id || '')
        .trim()
        .toLowerCase();
      const title = String(b.title || '')
        .trim()
        .toLowerCase();
      return id !== 'choice' && title !== 'выбор';
    })
    .map(b => {
      if (
        String(b.id || '')
          .trim()
          .toLowerCase() === 'condition'
      ) {
        return {
          ...b,
          title: 'Выбор',
          description: 'Направляет пользователя по разным веткам в зависимости от значения',
          category: 'basic',
        };
      }
      if (
        String(b.id || '')
          .trim()
          .toLowerCase() === 'action'
      ) {
        return {
          ...b,
          title: 'Данные пользователя',
          description: 'Изменяет теги, статус и поля профиля пользователя',
          category: 'basic',
        };
      }
      return { ...b, category: 'basic' };
    });
}
