# Predictor IA — Pronósticos Deportivos

Plataforma de predicciones deportivas con IA (Gemini + Hugging Face) y análisis de apuestas de valor en tiempo real.

## Stack

- **Frontend**: React 19, Vite 6, Tailwind CSS 4, react-router-dom 7
- **Backend**: Express (server.ts), sirve la SPA y expone la API REST
- **IA**: Google Gemini (`gemini-3.5-flash`), Hugging Face Inference API
- **Datos**: The Odds API v4, API-Football v3, scraping de ESPN (fallback)

## Requisitos

- Node.js 18+

## Configuración

1. Instala dependencias:
   ```
   npm install
   ```
2. Copia `.env.example` a `.env` y completa las claves (opcionales pero recomendadas):
   - `GEMINI_API_KEY` — análisis y auditoría IA (sin ella se usan resultados de demostración)
   - `THE_ODDS_API_KEY` — cuotas de casas de apuestas (sin ella se usa el scraper de ESPN)
   - `API_FOOTBALL_KEY` — fixtures, H2H, alineaciones y Copa del Mundo
   - `HF_API_KEY` — ensamble de modelos Hugging Face
3. Ejecuta:
   ```
   npm run dev
   ```
   Aplicación disponible en http://localhost:3000

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor único de desarrollo (Express API + Vite HMR en puerto 3000) |
| `npm run build` | Build de producción (Vite + bundle del servidor con esbuild) |
| `npm start` | Ejecuta el build de producción en `dist/server.cjs` |
| `npm run lint` | Typecheck con `tsc --noEmit` |

> **Nota**: Solo se requiere **un proceso de servidor**. `server.ts` inicia Express que sirve la API REST y, en desarrollo, integra Vite como middleware para HMR del frontend. No hay servidores separados.

## Estructura

```
server.ts              Servidor Express + endpoint de análisis Gemini
src/
  routes/              Endpoints de la API REST
  services/            Integraciones externas y lógica de predicción
  utils/               Cálculos matemáticos, caché y gestión de riesgo
  components/          Componentes React del dashboard
  pages/               Páginas (dashboard)
```