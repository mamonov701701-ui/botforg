import React, { cloneElement, isValidElement, ReactElement } from 'react';
import { toast } from '../utils/toast';
import { getAccessDeniedMessage, type ActionKey } from '../constants/roles';

interface AccessLockedProps {
  /** Есть ли доступ к действию */
  hasAccess: boolean;
  /** Ключ действия для сообщения об ограничении */
  actionKey: ActionKey;
  /** Дочерний элемент (кнопка и т.п.) */
  children: ReactElement;
  /** Обработчик клика при наличии доступа */
  onClick?: () => void;
}

/**
 * Оборачивает кнопку/элемент: при отсутствии доступа показывает disabled-состояние
 * и при клике выводит пояснение "Функция доступна для роли X".
 */
export function AccessLocked({ hasAccess, actionKey, children, onClick }: AccessLockedProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (!hasAccess) {
      e.preventDefault();
      e.stopPropagation();
      toast.warning(getAccessDeniedMessage(actionKey));
    }
  };

  if (hasAccess) {
    return isValidElement(children) ? (
      cloneElement(children, { onClick } as Record<string, unknown>)
    ) : (
      <>{children}</>
    );
  }

  return (
    <span
      onClick={handleClick}
      style={{
        display: 'inline-block',
        cursor: 'not-allowed',
        opacity: 0.65,
      }}
      title={getAccessDeniedMessage(actionKey)}
    >
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{ style?: React.CSSProperties; disabled?: boolean }>,
            {
              disabled: true,
              style: {
                ...((children as ReactElement<{ style?: React.CSSProperties }>).props.style || {}),
                pointerEvents: 'none' as const,
                cursor: 'not-allowed',
              },
            }
          )
        : children}
    </span>
  );
}
