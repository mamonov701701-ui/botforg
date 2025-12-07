import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Node, Edge } from 'reactflow';
import { nanoid } from 'nanoid';
import { BlockCatalogItem, PlanType, RoleType } from '../types/blocks';
import { fetchBlocksCatalog } from '../api/blocks';

export type ToastType = 'info' | 'warning' | 'error' | 'success';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

// Max items to store in recent blocks
const MAX_RECENT_BLOCKS = 10;

interface EditorStore {
  // Catalog data
  catalog: BlockCatalogItem[];
  plan: PlanType;
  role: RoleType;
  isLoading: boolean;

  // Flow data
  nodes: Node[];
  edges: Edge[];

  // Search filter
  searchQuery: string;

  // Toast notifications
  toasts: Toast[];

  // Favorites and Recent blocks (persisted)
  favoriteBlockIds: string[];
  recentBlockIds: string[];
  collapsedCategories: string[];

  // Actions
  setPlan: (plan: PlanType) => void;
  setRole: (role: RoleType) => void;
  setCatalog: (catalog: BlockCatalogItem[]) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setSearchQuery: (query: string) => void;
  loadCatalog: (plan?: PlanType, role?: RoleType) => Promise<void>;
  showToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;

  // Favorites and Recent actions
  toggleFavorite: (blockId: string) => void;
  addToRecent: (blockId: string) => void;
  toggleCategory: (category: string) => void;
  isFavorite: (blockId: string) => boolean;

  // Computed
  getFilteredCatalog: () => BlockCatalogItem[];
  getFavoriteBlocks: () => BlockCatalogItem[];
  getRecentBlocks: () => BlockCatalogItem[];
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      // Initial state
      catalog: [],
      plan: 'free',
      role: 'developer',
      isLoading: false,
      nodes: [],
      edges: [],
      searchQuery: '',
      toasts: [],
      favoriteBlockIds: [],
      recentBlockIds: [],
      collapsedCategories: [],

      // Actions
      setPlan: plan => {
        set({ plan });
        get().loadCatalog(plan, get().role);
      },

      setRole: role => {
        set({ role });
        get().loadCatalog(get().plan, role);
      },

      setCatalog: catalog => set({ catalog }),

      setNodes: nodes => {
        if (typeof nodes === 'function') {
          set(state => ({ nodes: nodes(state.nodes) }));
        } else {
          set({ nodes });
        }
      },

      setEdges: edges => {
        if (typeof edges === 'function') {
          set(state => ({ edges: edges(state.edges) }));
        } else {
          set({ edges });
        }
      },

      setSearchQuery: query => set({ searchQuery: query }),

      loadCatalog: async (plan?: PlanType, role?: RoleType) => {
        // Параметры plan и role больше не используются на бэкенде
        // Бэкенд автоматически использует данные авторизованного пользователя
        set({ isLoading: true });
        try {
          const catalog = await fetchBlocksCatalog();
          set({ catalog, isLoading: false });
        } catch (error: any) {
          console.error('Failed to load catalog:', error);
          // Если ошибка авторизации - показываем соответствующее сообщение
          if (error.status === 401) {
            get().showToast('Для доступа к библиотеке блоков необходимо войти в систему', 'error');
          } else {
            get().showToast('Не удалось загрузить блоки. Попробуйте позже.', 'error');
          }
          set({ isLoading: false, catalog: [] });
        }
      },

      showToast: (message, type) => {
        const id = nanoid();
        set(state => ({
          toasts: [...state.toasts, { id, message, type, duration: 3000 }],
        }));
        setTimeout(() => get().removeToast(id), 3000);
      },

      removeToast: id => {
        set(state => ({
          toasts: state.toasts.filter(t => t.id !== id),
        }));
      },

      // Favorites management
      toggleFavorite: blockId => {
        set(state => {
          const isFav = state.favoriteBlockIds.includes(blockId);
          return {
            favoriteBlockIds: isFav
              ? state.favoriteBlockIds.filter(id => id !== blockId)
              : [...state.favoriteBlockIds, blockId],
          };
        });
      },

      isFavorite: blockId => {
        return get().favoriteBlockIds.includes(blockId);
      },

      // Recent blocks management
      addToRecent: blockId => {
        set(state => {
          const filtered = state.recentBlockIds.filter(id => id !== blockId);
          const updated = [blockId, ...filtered].slice(0, MAX_RECENT_BLOCKS);
          return { recentBlockIds: updated };
        });
      },

      // Category collapse management
      toggleCategory: category => {
        set(state => {
          const isCollapsed = state.collapsedCategories.includes(category);
          return {
            collapsedCategories: isCollapsed
              ? state.collapsedCategories.filter(c => c !== category)
              : [...state.collapsedCategories, category],
          };
        });
      },

      // Computed getters
      getFilteredCatalog: () => {
        const { catalog, searchQuery } = get();
        if (!searchQuery.trim()) return catalog;

        const query = searchQuery.toLowerCase();
        return catalog.filter(
          block =>
            block.title.toLowerCase().includes(query) ||
            block.description.toLowerCase().includes(query)
        );
      },

      getFavoriteBlocks: () => {
        const { catalog, favoriteBlockIds } = get();
        return catalog.filter(block => favoriteBlockIds.includes(block.id));
      },

      getRecentBlocks: () => {
        const { catalog, recentBlockIds } = get();
        return recentBlockIds
          .map(id => catalog.find(block => block.id === id))
          .filter((block): block is BlockCatalogItem => block !== undefined);
      },
    }),
    {
      name: 'botforg-editor-storage',
      partialize: state => ({
        favoriteBlockIds: state.favoriteBlockIds,
        recentBlockIds: state.recentBlockIds,
        collapsedCategories: state.collapsedCategories,
      }),
    }
  )
);
