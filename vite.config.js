import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Pages: the PV player (home), the HyperStage studio (v2) and the INSIDE IDENTITY 8-character dance stage.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        v2: resolve(import.meta.dirname, 'v2.html'),
        insideIdentity: resolve(import.meta.dirname, 'inside-identity.html'),
      },
    },
  },
});
