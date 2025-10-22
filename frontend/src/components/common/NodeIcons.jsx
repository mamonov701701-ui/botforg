import {
  Rocket,
  MessageSquare,
  Settings,
  HelpCircle,
  Download,
  Upload,
  GitBranch,
  RefreshCw,
  Flag,
  Circle,
} from 'lucide-react';

// Функция для получения иконки по типу узла
export const getNodeIcon = (type) => {
  switch (type) {
    case 'start':
      return <Rocket className="w-4 h-4" />;
    case 'message':
      return <MessageSquare className="w-4 h-4" />;
    case 'action':
      return <Settings className="w-4 h-4" />;
    case 'condition':
      return <HelpCircle className="w-4 h-4" />;
    case 'question':
      return <HelpCircle className="w-4 h-4" />;
    case 'input':
      return <Download className="w-4 h-4" />;
    case 'output':
      return <Upload className="w-4 h-4" />;
    case 'decision':
      return <GitBranch className="w-4 h-4" />;
    case 'process':
      return <RefreshCw className="w-4 h-4" />;
    case 'end':
      return <Flag className="w-4 h-4" />;
    default:
      return <Circle className="w-4 h-4" />;
  }
};

// Функция для получения цвета по типу узла
export const getNodeColor = (type) => {
  switch (type) {
    case 'start':
      return '#34d399'; // зеленый
    case 'message':
      return '#3b82f6'; // синий
    case 'action':
      return '#f59e0b'; // янтарный
    case 'condition':
      return '#8b5cf6'; // фиолетовый
    case 'question':
      return '#8b5cf6'; // фиолетовый
    case 'input':
      return '#06b6d4'; // голубой
    case 'output':
      return '#84cc16'; // лаймовый
    case 'decision':
      return '#ec4899'; // розовый
    case 'process':
      return '#6366f1'; // индиго
    case 'end':
      return '#ef4444'; // красный
    default:
      return '#6b7280'; // серый
  }
};
