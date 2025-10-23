import { create } from 'zustand';
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

  // Computed
  getFilteredCatalog: () => BlockCatalogItem[];
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Initial state
  catalog: [],
  plan: 'free',
  role: 'developer',
  isLoading: false,
  nodes: [
    {
      id: nanoid(),
      type: 'default',
      position: { x: 250, y: 100 },
      data: {
        blockId: 'start',
        title: 'Начало',
        icon: 'PlayCircle',
        color: '#4CAF50',
        settings: {},
      },
      style: {
        borderColor: '#4CAF50',
      },
    },
  ],
  edges: [],
  searchQuery: '',
  toasts: [],

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
    const currentPlan = plan || get().plan;
    const currentRole = role || get().role;

    set({ isLoading: true });
    try {
      const catalog = await fetchBlocksCatalog(currentPlan, currentRole);
      set({ catalog, isLoading: false });
    } catch (error: any) {
      console.error('Failed to load catalog:', error);
      get().showToast('Не удалось загрузить блоки. Попробуйте позже.', 'error');
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

  getFilteredCatalog: () => {
    const { catalog, searchQuery } = get();
    if (!searchQuery.trim()) return catalog;

    const query = searchQuery.toLowerCase();
    return catalog.filter(
      block =>
        block.title.toLowerCase().includes(query) || block.description.toLowerCase().includes(query)
    );
  },
}));
