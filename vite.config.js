import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './apps'),
            '@packages': path.resolve(__dirname, './packages'),
        },
    },
    server: {
        // v19.5: el ERP dejó de ser solo "reparto" — ahora sirve a TODOS los
        // colaboradores con su nivel de acceso. El subdominio público pasa a
        // `erp.rdericotoluca.com`. Se conserva `reparto.*` durante la
        // transición para no romper enlaces ya compartidos.
        // `api.rdericotoluca.com` NO se toca: `apps/shared/config.js` deriva la
        // URL del API desde el hostname, y el túnel enruta ese host a :5001.
        allowedHosts: [
            'erp.rdericotoluca.com',
            'reparto.rdericotoluca.com',
            'api.rdericotoluca.com',
        ],
        port: 5173,
        open: false,
        watch: {
            usePolling: true,
            ignored: [
                '**/apps/api/**',
                '**/node_modules/**',
                '**/.git/**',
                '**/database_backups/**',
                '**/dist/**',
                '**/*.py',
                '**/*.log',
            ],
        },
    },
});
