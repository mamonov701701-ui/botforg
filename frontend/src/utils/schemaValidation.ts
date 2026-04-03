import { Node } from 'reactflow';
import { BlockCatalogItem, BlockConfigField } from '../types/blocks';
import { normalizeMessageButtonAction } from './messageButton';
import {
  inferMessageMediaKindFromUrl,
  messageMediaItemMatchesDeclared,
  type MessageMediaKind,
} from './messageMedia';
import { validateInputBlockConfigFields, migrateInputNodeSettings } from './inputBlock';

export interface ValidationResult {
  nodeId: string;
  isValid: boolean;
  missingFields: string[];
  blockTitle?: string;
}

/** Сообщения validateNodeSettings для блока message, относящиеся к медиа (для подсветки поля «Медиа-файлы»). */
export function isMessageBlockMediaValidationMessage(msg: string): boolean {
  return (
    msg.startsWith('Медиа') ||
    msg.includes('Медиа-файлы') ||
    msg.toLowerCase().includes('медиа-файл')
  );
}

/**
 * Validates a single node's settings against its block's configSchema
 */
export function validateNodeSettings(
  node: Node,
  block: BlockCatalogItem | undefined,
  scenarios?: Array<{ id: number; name: string }>
): ValidationResult {
  if (!block) {
    return {
      nodeId: node.id,
      isValid: false,
      missingFields: ['Описание блока не найдено в каталоге'],
      blockTitle: node.data.title,
    };
  }

  const missingFields: string[] = [];
  const settings = node.data.settings || {};

  if (block.id === 'input') {
    const migrated = migrateInputNodeSettings({ ...settings } as Record<string, unknown>);
    missingFields.push(...validateInputBlockConfigFields(migrated));
    return {
      nodeId: node.id,
      isValid: missingFields.length === 0,
      missingFields,
      blockTitle: block.title,
    };
  }

  // Check each required field from configSchema
  if (block.configSchema) {
    block.configSchema.forEach((field: BlockConfigField) => {
      // Проверяем dependsOn - если поле зависит от другого и условие не выполнено, пропускаем
      if (field.dependsOn) {
        const dependentValue = settings[field.dependsOn.field];
        const conditionMet = dependentValue === field.dependsOn.value;
        const shouldValidate = field.dependsOn.invert ? !conditionMet : conditionMet;

        if (!shouldValidate) {
          return; // Пропускаем валидацию этого поля
        }
      }

      if (field.required) {
        const value = settings[field.name];
        // Check for empty values (null, undefined, empty string, empty array)
        if (value === null || value === undefined || value === '') {
          missingFields.push(field.label);
        } else if (Array.isArray(value) && value.length === 0) {
          missingFields.push(field.label);
        }
      }
    });
  }

  // Специальная валидация для блока go_to_scenario
  if (block.id === 'go_to_scenario' && scenarios) {
    const targetScenarioId = settings.targetScenarioId;

    // Проверяем, существует ли выбранный сценарий
    if (targetScenarioId) {
      const scenarioExists = scenarios.some(s => s.id === targetScenarioId);
      if (!scenarioExists) {
        missingFields.push('Выбранный сценарий не найден (возможно, удалён)');
      }
    }

    // Если выбран режим "с конкретного шага", проверяем наличие targetNodeId
    if (settings.startMode === 'from_step' && !settings.targetNodeId) {
      missingFields.push('Конкретный шаг');
    }
  }

  // Специальная валидация для блока message
  if (block.id === 'message') {
    // Валидация кнопок
    if (settings.buttons && Array.isArray(settings.buttons)) {
      settings.buttons.forEach((button: any, index: number) => {
        if (!button.label || button.label.trim() === '') {
          missingFields.push(`Текст кнопки ${index + 1}`);
        }
        const act = normalizeMessageButtonAction(button.action);
        if (act === 'url') {
          const u = (button.url || '').trim();
          if (!u) {
            missingFields.push(`URL кнопки ${index + 1}`);
          } else if (!/^https?:\/\//i.test(u)) {
            missingFields.push(`URL кнопки ${index + 1}: укажите адрес с http:// или https://`);
          }
        }
      });

      // Ограничение количества кнопок
      if (settings.buttons.length > 10) {
        missingFields.push('Слишком много кнопок (максимум 10)');
      }
    }

    // Валидация медиа (актуально: mediaList; legacy: mediaUrl)
    if (settings.mediaType && settings.mediaType !== 'none') {
      const declared = settings.mediaType as MessageMediaKind;
      const list = settings.mediaList;
      const legacyUrl = String((settings as { mediaUrl?: unknown }).mediaUrl ?? '').trim();

      const pushMismatch = (indexLabel: string) => {
        const hint =
          declared === 'image'
            ? 'ожидается изображение (JPEG, PNG, WebP)'
            : declared === 'gif'
              ? 'ожидается GIF'
              : 'ожидается видео (например MP4, WebM, MOV)';
        missingFields.push(`Медиа ${indexLabel}: несовпадение с типом «${declared}» (${hint})`);
      };

      if (Array.isArray(list) && list.length > 0) {
        list.forEach((raw: Record<string, unknown>, index: number) => {
          const url = String(raw?.url ?? '').trim();
          if (!url) {
            missingFields.push(`Медиа ${index + 1}: укажите файл или ссылку`);
            return;
          }
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            missingFields.push(
              `Медиа ${index + 1}: ссылка должна начинаться с http:// или https://`
            );
            return;
          }
          const inferred = inferMessageMediaKindFromUrl(url);
          const stored =
            raw?.type === 'gif' || raw?.type === 'video' || raw?.type === 'image' ? raw.type : null;
          const ok =
            messageMediaItemMatchesDeclared(declared, inferred) ||
            (stored != null && messageMediaItemMatchesDeclared(declared, stored));
          if (!ok) {
            pushMismatch(String(index + 1));
          }
        });
      } else if (legacyUrl) {
        if (!legacyUrl.startsWith('http://') && !legacyUrl.startsWith('https://')) {
          missingFields.push('Медиа: ссылка должна начинаться с http:// или https://');
        } else {
          const inferred = inferMessageMediaKindFromUrl(legacyUrl);
          if (!messageMediaItemMatchesDeclared(declared, inferred)) {
            pushMismatch('(ссылка)');
          }
        }
      } else {
        missingFields.push('Медиа-файлы: добавьте хотя бы один файл или ссылку');
      }
    }
  }

  return {
    nodeId: node.id,
    isValid: missingFields.length === 0,
    missingFields,
    blockTitle: block.title,
  };
}

/**
 * Validates all nodes in a flow against the catalog
 */
export function validateAllNodesWithSchema(
  nodes: Node[],
  catalog: BlockCatalogItem[],
  scenarios?: Array<{ id: number; name: string }>
): ValidationResult[] {
  return nodes.map(node => {
    const block = catalog.find(b => b.id === node.data.blockId);
    return validateNodeSettings(node, block, scenarios);
  });
}

/**
 * Checks if any validation results contain errors
 */
export function hasValidationErrors(results: ValidationResult[]): boolean {
  return results.some(r => !r.isValid);
}
