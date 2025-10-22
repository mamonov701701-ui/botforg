import { create } from 'zustand';
import { ValidationResult } from '../utils/schemaValidation';

interface ValidationStore {
  validationResults: Map<string, ValidationResult>;
  isValidating: boolean;
  
  setValidationResult: (nodeId: string, result: ValidationResult) => void;
  setAllValidationResults: (results: ValidationResult[]) => void;
  clearValidation: () => void;
  getNodeValidation: (nodeId: string) => ValidationResult | undefined;
  hasErrors: () => boolean;
  getInvalidNodes: () => ValidationResult[];
}

export const useValidationStore = create<ValidationStore>((set, get) => ({
  validationResults: new Map(),
  isValidating: false,
  
  setValidationResult: (nodeId, result) => {
    set(state => {
      const newMap = new Map(state.validationResults);
      newMap.set(nodeId, result);
      return { validationResults: newMap };
    });
  },
  
  setAllValidationResults: (results) => {
    const newMap = new Map<string, ValidationResult>();
    results.forEach(r => newMap.set(r.nodeId, r));
    set({ validationResults: newMap });
  },
  
  clearValidation: () => {
    set({ validationResults: new Map() });
  },
  
  getNodeValidation: (nodeId) => {
    return get().validationResults.get(nodeId);
  },
  
  hasErrors: () => {
    const results = Array.from(get().validationResults.values());
    return results.some(r => !r.isValid);
  },
  
  getInvalidNodes: () => {
    const results = Array.from(get().validationResults.values());
    return results.filter(r => !r.isValid);
  }
}));

