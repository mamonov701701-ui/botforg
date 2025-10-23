/**
 * Stub declaration for Next.js router - not used in this Vite project
 */

declare module 'next/router' {
  export function useRouter(): {
    query: any;
    pathname: string;
    push: (path: string) => void;
    replace: (path: string) => void;
  };
}
