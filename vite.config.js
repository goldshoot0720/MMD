import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Pages: the HyperStage studio, the INSIDE IDENTITY 8-character dance stage and the PV renderer.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        insideIdentity: resolve(import.meta.dirname, 'inside-identity.html'),
        pv: resolve(import.meta.dirname, 'pv.html'),
      },
    },
  },
});
