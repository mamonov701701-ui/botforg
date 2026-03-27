import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true });

export function docMarkdownToSafeHtml(src: string): string {
  const html = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
}
