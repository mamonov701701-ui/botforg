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

interface Props {
  field: BlockConfigField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

export const FieldRenderer: React.FC<Props> = (props) => {
  switch (props.field.type) {
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
    case 'datetime':
    case 'image':
    case 'file':
      return (
        <div style={{ 
          marginBottom: 16, 
          padding: 12, 
          background: '#1a1a2e', 
          borderRadius: 8,
          opacity: 0.6,
          fontSize: 13
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{props.field.label}</div>
          <div>Тип поля "{props.field.type}" скоро будет доступен...</div>
        </div>
      );
    default:
      return (
        <div style={{ 
          marginBottom: 16, 
          padding: 12, 
          background: '#1a1a2e', 
          borderRadius: 8,
          color: '#ef4444',
          fontSize: 13
        }}>
          Неизвестный тип поля: {props.field.type}
        </div>
      );
  }
};

