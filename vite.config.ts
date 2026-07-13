import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/namtang-api': {
        target: 'https://namtang-api.otp.go.th',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/namtang-api/, ''),
      },
    },
  },
});
