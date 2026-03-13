import React from 'react';
import { BlockConfigField } from '../../../types/blocks';
import { StringField } from './fields/StringField';
import { TextField } from './fields/TextField';
import { NumberField } from './fields/NumberField';
import { BooleanField } from './fields/BooleanField';
import { SelectField } from './fields/SelectField';
import { MultiselectField } from './fields/MultiselectField';
import { JsonField } from './fields/JsonField';
import { DurationField } from './fields/DurationField';
import { ScenarioSelectField } from './fields/ScenarioSelectField';
import { NodeSelectField } from './fields/NodeSelectField';
import { ButtonListField } from './fields/ButtonListField';
import { MediaUploadField } from './fields/MediaUploadField';
import { MediaListField } from './fields/MediaListField';
import { FieldProps } from './fields/types';

export const FieldRenderer: React.FC<FieldProps> = props => {
  const { field, allSettings } = props;

  // Проверка dependsOn - если поле зависит от другого и условие не выполнено, не показываем
  if (field.dependsOn && allSettings) {
    const dependentValue = allSettings[field.dependsOn.field];
    const conditionMet = dependentValue === field.dependsOn.value;
    const shouldShow = field.dependsOn.invert ? !conditionMet : conditionMet;

    if (!shouldShow) {
      return null;
    }
  }

  switch (field.type) {
    case 'string':
      return <StringField {...props} />;
    case 'text':
      return <TextField {...props} />;
    case 'number':
      return <NumberField {...props} />;
    case 'boolean':
      return <BooleanField {...props} />;
    case 'select':
      return <SelectField {...props} />;
    case 'multiselect':
      return <MultiselectField {...props} />;
    case 'json':
      return <JsonField {...props} />;
    case 'duration':
      return <DurationField {...props} />;
    case 'scenario_select':
      return <ScenarioSelectField {...props} />;
    case 'node_select':
      // Передаём ID выбранного сценария для загрузки его блоков
      return <NodeSelectField {...props} scenarioId={allSettings?.targetScenarioId} />;
    case 'button_list':
      return <ButtonListField {...props} />;
    case 'media_upload':
      return (
        <MediaUploadField
          {...props}
          mediaSource={allSettings?.mediaSource as 'upload' | 'url'}
          mediaType={allSettings?.mediaType as 'none' | 'image' | 'gif' | 'video'}
        />
      );
    case 'media_list':
      return (
        <MediaListField
          {...props}
          mediaType={allSettings?.mediaType as 'none' | 'image' | 'gif' | 'video'}
        />
      );
    case 'datetime':
    case 'image':
    case 'file':
      return (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: '#1a1a2e',
            borderRadius: 8,
            opacity: 0.6,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{field.label}</div>
          <div>Тип поля "{field.type}" скоро будет доступен...</div>
        </div>
      );
    default:
      return (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: '#1a1a2e',
            borderRadius: 8,
            color: '#ef4444',
            fontSize: 13,
          }}
        >
          Неизвестный тип поля: {field.type}
        </div>
      );
  }
};
