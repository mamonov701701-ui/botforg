import { useCallback, useEffect, useState } from 'react';
import { fetchBlocksCatalog } from '../../../api/blocks';
import type { BlockCatalogItem } from '../../../types/blocks';
import { userVisibleBlocks } from '../../../utils/blockCatalogPresentation';

export function useUserBlockCatalog() {
  const [blocks, setBlocks] = useState<BlockCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchBlocksCatalog();
      setBlocks(userVisibleBlocks(items));
    } catch {
      setError('Не удалось загрузить библиотеку блоков. Попробуйте ещё раз позже.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { blocks, loading, error, reload };
}
