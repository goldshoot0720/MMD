import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the HyperStage studio and the INSIDE IDENTITY 8-character dance stage.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        insideIdentity: resolve(import.meta.dirname, 'inside-identity.html'),
      },
    },
  },
});
