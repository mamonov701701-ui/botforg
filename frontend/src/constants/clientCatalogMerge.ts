import type { BlockCatalogItem } from '../types/blocks';

/**
 * Клиентская нормализация каталога:
 * - убираем legacy-блок id=choice
 * - сохраняем фактическую функциональную категорию из каталога
 * - legacy category=custom у пользовательского блока считаем базовой категорией,
 *   потому что происхождение уже передаётся отдельным полем source
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
      if (b.source === 'custom' && b.category === 'custom') {
        return { ...b, category: 'basic' };
      }
      return b;
    });
}
