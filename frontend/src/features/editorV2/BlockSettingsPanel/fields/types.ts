import { BlockConfigField } from '../../../../types/blocks';

export interface FieldProps {
  field: BlockConfigField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}
