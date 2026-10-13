import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Preview rendering writes these artifacts without reloading the editor.
  server: { watch: { ignored: ['**/public/templates/**', '**/.local/**'] } },
  build: { chunkSizeWarningLimit: 1000 },
});
