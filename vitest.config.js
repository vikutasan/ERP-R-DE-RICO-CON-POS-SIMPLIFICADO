/**
 * v7 (Fase 3.2): Configuracion de Vitest para tests de frontend.
 *
 * Objetivo: validar el mapeo de campos API (espanol) -> UI (ingles) y la
 * validacion de formularios del modulo de almacenes, sin tocar el POS.
 *
 * Nota: se usa un archivo separado de vite.config.js para no alterar el
 * build de produccion ni el dev server del POS.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Entorno DOM para poder montar componentes React si hiciera falta.
        environment: 'jsdom',
        // Los tests viven junto al codigo que prueban.
        include: ['apps/**/*.test.{js,jsx}'],
        globals: true,
        // Sin watch por defecto (el script "test" ya usa `vitest run`).
        watch: false,
    },
});
