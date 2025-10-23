/**
 * Stub declarations for chart libraries - not used in this project
 */

declare module 'react-chartjs-2' {
  import React from 'react';
  export const Bar: React.FC<any>;
  export const Line: React.FC<any>;
  export const Pie: React.FC<any>;
  export const Doughnut: React.FC<any>;
}

declare module 'chart.js' {
  export class Chart {
    static register(...args: any[]): void;
  }
  export const CategoryScale: any;
  export const LinearScale: any;
  export const BarElement: any;
  export const Title: any;
  export const Tooltip: any;
  export const Legend: any;
  export function register(...args: any[]): void;
}

