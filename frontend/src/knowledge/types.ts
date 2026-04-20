export type KnowledgeField = {
  key: string;
  title: string;
  description: string;
};

export type KnowledgeExample = {
  scenario: string;
  setup: string[];
  result: string;
};

export type KnowledgePreview = {
  behavesLikeRealFlow: boolean;
  differences: string[];
};

export type KnowledgeBehavior = {
  steps: string[];
  branches: string[];
  dataRules: string[];
};

export type KnowledgeUsage = {
  whenToUse: string[];
  whenNotToUse: string[];
};

export type KnowledgePurpose = {
  whatDoes: string[];
  whatDoesNot: string[];
};

export type KnowledgeLocation = {
  editor: string | null;
  menu: string | null;
  section: string | null;
};

export type KnowledgeEntity = {
  id: string;
  type: 'block' | 'crm' | 'section' | 'system';
  key: string;
  /** Старые ключи в данных сценария или API (обратная совместимость). */
  legacyKeys?: string[];

  title: string;
  group: string | null;
  location: KnowledgeLocation;

  summary: string;

  purpose: KnowledgePurpose;
  usage: KnowledgeUsage;

  fields: {
    required: KnowledgeField[];
    optional: KnowledgeField[];
  };

  constraints: string[];

  behavior: KnowledgeBehavior;

  preview: KnowledgePreview;

  errors: string[];

  example: KnowledgeExample;

  checklist: string[];

  related: string[];

  entry: string[];

  search: {
    keywords: string[];
    aliases: string[];
  };
};
