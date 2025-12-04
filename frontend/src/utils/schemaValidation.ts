import { Node } from 'reactflow';
import { BlockCatalogItem, BlockConfigField } from '../types/blocks';

export interface ValidationResult {
  nodeId: string;
  isValid: boolean;
  missingFields: string[];
  blockTitle?: string;
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
      missingFields: ['Block definition not found'],
      blockTitle: node.data.title,
    };
  }

  const missingFields: string[] = [];
  const settings = node.data.settings || {};

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
      });

      // Ограничение количества кнопок
      if (settings.buttons.length > 10) {
        missingFields.push('Слишком много кнопок (максимум 10)');
      }
    }

    // Валидация медиа
    if (settings.mediaType && settings.mediaType !== 'none') {
      if (!settings.mediaUrl || settings.mediaUrl.trim() === '') {
        missingFields.push('Ссылка на медиа-файл');
      } else if (
        !settings.mediaUrl.startsWith('http://') &&
        !settings.mediaUrl.startsWith('https://')
      ) {
        missingFields.push('Ссылка должна начинаться с http:// или https://');
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
