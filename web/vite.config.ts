import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{port:5178,strictPort:true,proxy:{'/api':'http://127.0.0.1:8787','/install-agent.sh':'http://127.0.0.1:8787'}},build:{chunkSizeWarningLimit:1000}});
