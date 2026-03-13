import { flushToFile } from './global-api-collector';

export default async function globalTeardown(): Promise<void> {
  flushToFile();
}
