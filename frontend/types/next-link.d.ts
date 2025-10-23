/**
 * Stub declaration for Next.js Link component - not used in this Vite project
 */

declare module 'next/link' {
  import React from 'react';
  
  interface LinkProps {
    href: string;
    children: React.ReactNode;
    [key: string]: any;
  }
  
  const Link: React.FC<LinkProps>;
  export default Link;
}

