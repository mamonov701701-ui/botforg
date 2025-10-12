import { NodeTypes } from 'reactflow';
import CustomNode from './CustomNode';

export const createNodeTypes = (): NodeTypes => ({
  default: CustomNode,
  start: CustomNode,
  message: CustomNode,
});























