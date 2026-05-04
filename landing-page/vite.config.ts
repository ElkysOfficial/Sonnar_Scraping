import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Otimizações de build
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,

    // Gerar sourcemaps apenas em dev
    sourcemap: false,

    // Chunk size warning threshold
    chunkSizeWarningLimit: 500,

    rollupOptions: {
      output: {
        // Separar vendors em chunks menores
        manualChunks: {
          // Vue core - carregado sempre
          'vue-vendor': ['vue', 'vue-router'],

          // Supabase - carregado quando necessário
          'supabase': ['@supabase/supabase-js'],

          // Ant Design - separar componentes pesados
          'antd-core': ['ant-design-vue'],

          // Date utilities
          'date-utils': ['date-fns'],

          // Validation
          'validation': ['zod'],
        },

        // Naming pattern para assets
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },

  // Otimizações de dependências
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      '@supabase/supabase-js',
      'date-fns',
    ],
    exclude: [],
  },
});
