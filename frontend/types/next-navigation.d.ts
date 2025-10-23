/**
 * Stub declaration for Next.js navigation - not used in this Vite project
 */

declare module 'next/navigation' {
  export function useParams(): any;
  export function useRouter(): {
    push: (path: string) => void;
    replace: (path: string) => void;
    back: () => void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
}
