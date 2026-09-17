# Predictor IA — Documentación Técnica Completa

---

## 1. Visión General

**Predictor IA** es una plataforma integral de predicciones deportivas que combina **modelos matemáticos puros** (Poisson, Gaussiano), **ensemble de LLMs gratuitos** (Hugging Face), y **auditoría semántica con Gemini** para generar pronósticos de alto valor esperado (EV+) en 12 deportes.

La aplicación funciona como **SPA (Single Page Application)** servida por **Express** en desarrollo y producción, con capacidad de empaquetado como **aplicación de escritorio nativa** vía Electron.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|------------|---------|-----------|
| **Frontend** | React | 19.0.1 | UI reactiva con Server Components pattern |
| | Vite | 6.2.3 | Bundler ultrarrápido + HMR |
| | Tailwind CSS | 4.1.14 | Utility-first styling (configuración CSS-first) |
| | react-router-dom | 7.18.1 | Routing SPA tipo archivo |
| | Motion | 12.23.24 | Animaciones declarativas |
| | Lucide React | 0.546.0 | Iconografía SVG optimizada |
| **Backend** | Express | 4.21.2 | API REST + servir assets estáticos |
| | tsx | 4.21.0 | Ejecución TypeScript nativa en dev |
| | esbuild | 0.25.0 | Bundle servidor para producción (CJS) |
| **IA / ML** | @google/genai | 2.4.0 | Cliente Gemini 3.5 Flash (auditoría + SGP) |
| | @huggingface/inference | 4.13.22 | Cliente HF Inference API (Qwen 2.5 7B, Llama 3.1 8B) |
| **Datos** | cheerio | 1.2.0 | Scraping ESPN (fallback) |
| | The Odds API v4 | REST | Cuotas tiempo real multi-bookmaker |
| | API-Football v3 | REST | Fixtures, H2H, alineaciones, standings |
| **Desktop** | Electron | 30.0.0 | Wrapper nativo multiplataforma |
| | electron-builder | 26.15.3 | Empaquetado NSIS (Windows) |
| **Calidad** | TypeScript | 5.8.2 | Tipado estricto (strict mode) |
| | ESLint (via tsc) | -- | `npm run lint` = `tsc --noEmit` |

---

## 3. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (React SPA)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Partidos │ │ Dashboard│ │ Parlay IA│ │ Componentes UI   │  │
│  │  (Home)  │ │ (Charts) │ │(Optimizer)│ │ (11 componentes) │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│         │           │           │               │              │
│         └───────────┼───────────┼───────────────┘              │
│                     ▼           ▼                              │
│         ┌─────────────────────────────────┐                    │
│         │     React Query / Fetch API     │                    │
│         │  (Polling 60s + Manual Refresh) │                    │
│         └─────────────────────────────────┘                    │
└─────────────────────────┬─────────────────────────────────────┘
                          │ HTTP/JSON (puerto 3000)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVIDOR EXPRESS                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MIDDLEWARE: JSON parser, CORS, Vite (dev) / Static (prod)│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│  │Predict│ │Upcoming  │ │WorldCup│ │Active  │ │   Otros    │  │
│  │ /api/ │ │ Matches  │ │ Live   │ │Markets │ │  7 rutas   │  │
│  └──────┘ └──────────┘ └────────┘ └────────┘ └────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SERVICIOS CORE (inyección por importación ESModule)     │   │
│  │  sportsApi → mathAnalyzer → hfModels → geminiAudit      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────┬─────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │The Odds API│  │API-Football│  │  Hugging   │
   │   (Cuotas) │  │ (Fixtures) │  │    Face    │
   └────────────┘  └────────────┘  └────────────┘
                          │
                          ▼
                   ┌────────────┐
                   │  Gemini    │
                   │ 3.5 Flash  │
                   └────────────┘
```

---

## 4. Flujo de Datos Principal: `/api/predict`

El endpoint **POST /api/predict** orquesta el pipeline completo:

### 4.1 Entrada (Request Body)
```typescript
interface PredictRequestBody {
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamId?: number;      // API-Football ID
  awayTeamId?: number;
  sport: "soccer" | "basketball" | "baseball" | "tennis";
  league?: string;
  homeTeamForm?: string[];  // ["W","W","D","L","W"] fallback
  awayTeamForm?: string[];
}
```

### 4.2 Pipeline de 5 Etapas

```
ETAPA 1: RECOLECCIÓN DE DATOS REALES
├── searchTeam() ×2 → team IDs
├── getTeamLastMatches() ×2 → forma reciente (5 partidos)
├── getHeadToHead() → H2H últimos 5
└── findOddsForMatchup() → mejor cuota H2H multi-bookmaker
    (The Odds API: eu/us regions, mercados h2h/spreads/totals)

ETAPA 2: NORMALIZACIÓN MATEMÁTICA
├── toMatchRecords() → MatchRecord[] (goles a favor/contra + localía)
├── formToMatchRecords() → sintético si solo hay W/D/L
└── calculateMatchProjection(sport, home, away)
    ├── soccer    → Poisson (λ_home, λ_away) → matriz 11×11
    ├── basketball→ Gaussiano (μ_diff, σ_diff) → P(D>0)
    ├── baseball  → Gaussiano runs
    └── tennis    → Win-rate + home advantage (5%)
Salida: probabilidades puras {homeWin%, draw%, awayWin%} + top scorelines

ETAPA 3: ENSEMBLE HUGGING FACE (paralelo)
├── Qwen 2.5 7B-Instruct
├── Llama 3.1 8B-Instruct
└── Consenso ponderado + agreementScore (desviación estándar)
    Prompt incluye: forma, promedios, H2H, cuotas, mathProbs

ETAPA 4: AUDITORÍA GEMINI (si GEMINI_API_KEY configurada)
└── Prompt estructurado "Auditor Estadístico de Élite"
    1. Zonas de presión (tabla, descenso, título)
    2. Regresión a la media (rachas 5W/5L)
    3. Factores contextuales (lesiones, calendario, rivalidad)
    4. Probabilidades ajustadas (suman 100%)
    5. Evaluación de valor vs cuotas mercado
Salida JSON validado por schema Type.OBJECT

ETAPA 5: VALUE ASSESSMENT (cálculo determinista)
├── impliedProb = 1/odds × 100
├── edge = adjustedProb - impliedProb
├── rating: premium (>12%) | alta (>5%) | media (>0%) | ninguna
└── Kelly Criterion stake suggestion
```

### 4.3 Salida (PredictResponse)
```typescript
interface PredictResponse {
  match: { homeTeam, awayTeam, sport, league };
  mathProjection: { probabilities, inputs, topScorelines, confidence };
  bookmakerOdds: { home, draw, away, source } | null;
  hfEnsemble: { consensus, models[], agreementScore };
  aiAudited: { adjustedProbabilities, confidence, reasoning };
  valueAssessment: { isValueBet, edgePercent, rating, recommendation };
  isFallback: boolean;
}
```

---

## 5. APIs Externas Integradas

### 5.1 The Odds API v4 (`THE_ODDS_API_KEY`)
- **Endpoint base**: `https://api.the-odds-api.com/v4`
- **Deportes cubiertos**: 12 categorías → 60+ sport_keys (EPL, LaLiga, NBA, MLB, ATP, NFL, NHL, IPL, NRL, UFC, AFL, Majors Golf)
- **Mercados**: `h2h` (1X2), `spreads` (hándicap), `totals` (over/under)
- **Regiones**: `eu,us,uk,au` (configurable)
- **Caché**: 10 min por sport_key (TTL.UPCOMING)
- **Rate limit**: Respeta headers; delay 120ms entre sport_keys en `getAllUpcomingOdds()`

### 5.2 API-Football v3 (`API_FOOTBALL_KEY`)
- **Endpoint base**: `https://v3.football.api-sports.io`
- **Headers**: `x-apisports-key`
- **Endpoints usados**:
  - `/teams?search=` → búsqueda por nombre
  - `/fixtures?team=&last=5` → forma reciente
  - `/fixtures?h2h=ID1-ID2&last=10` → historial directo
- **Caché**: 10 min (TTL.UPCOMING)
- **Solo fútbol** (limitación de la API gratuita)

### 5.3 Hugging Face Inference API (`HF_API_KEY`)
- **Modelos registrados** (gratuitos, validados):
  - `Qwen/Qwen2.5-7B-Instruct` (temp 0.2, max 400 tokens)
  - `meta-llama/Llama-3.1-8B-Instruct` (temp 0.2, max 400 tokens)
- **Modo**: Chat Completion con system prompt estricto JSON
- **Fallback**: Si falla HF → consensus = mathProjection

### 5.4 Google Gemini (`GEMINI_API_KEY`)
- **Modelo**: `gemini-3.5-flash`
- **Dos endpoints distintos**:
  1. `/api/gemini/analysis` (server.ts) → Análisis táctico + **Same Game Parlay** completo
  2. Auditoría interna en `/api/predict` (predict.ts) → Ajuste probabilidades + value bet
- **Response Schema**: Tipado estricto con `@google/genai` Type.OBJECT
- **Fallback elegante**: Mock dataset `MOCK_ANALYSIS_FALLBACK` (8 partidos predefinidos)

### 5.5 ESPN Scraper (Fallback sin API keys)
- **cheerio** para parsear HTML de ESPN
- **Ruta**: `/api/upcoming-matches` → `dataScraper.ts`
- **Deportes**: NFL, NBA, MLB, NHL, CFB, Soccer (ligas principales)
- **Último recurso** cuando no hay `THE_ODDS_API_KEY`

---

## 6. Módulos Core (src/services + src/utils)

| Archivo | Responsabilidad | Exportaciones Clave |
|---------|-----------------|---------------------|
| **sportsApi.ts** | Capa de datos unificada (Odds API + API-Football + Caché) | `getUpcomingOdds`, `getHeadToHead`, `getTeamLastMatches`, `searchTeam`, `extractBestOdds`, `getAllUpcomingOdds` |
| **mathAnalyzer.ts** | Motor probabilístico puro (sin IA) | `calculateMatchProjection`, `poissonPMF`, `gaussianCDF`, `toMatchRecords`, `formToMatchRecords` |
| **hfModels.ts** | Ensemble de LLMs HF | `predictEnsemble`, `predictWithHF`, `getAvailableModels` |
| **monteCarloSimulator.ts** | Simulación N-partidos para distribución de resultados | `runMonteCarlo`, `simulateMatch` |
| **parlayOptimizer.ts** | Optimización combinada multi-deporte (EV+, Kelly, riesgo) | `optimizeParlay`, `ParlaySelection`, `OptimizationResult` |
| **genericParlayEngine.ts** | Motor genérico para cualquier mercado (dynamic markets) | `buildGenericParlay`, `GenericSelection` |
| **sameGameParlayEngine.ts** | SGP específico fútbol (correlación goles/córners/tiros) | `buildSameGameParlay`, `SGPLeg` |
| **parlayConstants.ts** | Configuración de riesgo por perfil | `RISK_PROFILES`, `MAX_LEGS`, `MIN_EDGE` |
| **parlayRiskManager.ts** | Gestión de bankroll por parlay (Kelly fraccional) | `calculateStake`, `RiskProfile` |
| **bankrollManager.ts** | Ledger persistente (localStorage) + auto-liquidación | `placeBet`, `autoSettleBets`, `getSnapshot`, `BetRecord` |
| **hedgingCalculator.ts** | Calculadora de cobertura (hedge) live | `calculateHedge`, `HedgeResult` |
| **smartMoneyTracker.ts** | Detección de movimientos "sharp" (line movement) | `trackSmartMoney`, `SmartMoneySignal` |
| **newsSentiment.ts** | Análisis sentimiento noticias (placeholder HF) | `analyzeNewsSentiment` |
| **dynamicMarketMapper.ts** | Mapeo cuotas → mercados normalizados (goals, corners, cards, player props) | `mapActiveMarkets`, `ActiveMarketGroup` |
| **matchStatsGenerator.ts** | Generador stats sintéticos por deporte (12 deportes) | `generateSoccerStats`, `generateBasketballStats`, ... |
| **worldCupLive.ts** | Sincronización automática Copa del Mundo (cron job) | `initWorldCupSync`, `stopWorldCupSync` |
| **apiCache.ts** | Caché en memoria con TTL + invalidación por patrón | `cacheGetOrSet`, `cacheInvalidate`, `TTL` |
| **sportScoreConfig.ts** | Configuración duraciones, reglas, scoring por deporte | `getSportConfig`, `SportConfig` |

---

## 7. Frontend: Componentes y Páginas

### 7.1 Rutas (App.tsx)
| Ruta | Componente | Descripción |
|------|------------|-------------|
| `/` | `HomePage` | Vista principal: partidos, filtros, parlay slip, value bets, simulador |
| `/dashboard` | `Dashboard` | Analytics visual: bankroll, yield, win rate, historial, gráficos |
| `/parlay` | `DedicatedParlayView` | Vista dedicada al optimizador de parlays multi-deporte |

### 7.2 Componentes Principales (src/components/)

| Componente | Props Clave | Función |
|------------|-------------|---------|
| `SportSelector` | `activeSport`, `onSelectSport` | Tabs horizontales 12 deportes |
| `HeroMatch` | `match`, `onOpenAnalysis` | Tarjeta destacada partido principal |
| `MatchAccordionStats` | `match`, `onOpenAnalysis`, `onAddToParlay` | Acordeón expandible con stats completas por deporte |
| `ValueBetsHub` | `matches`, `onSelectMatch` | Panel lateral: top value bets detectadas |
| `ParlaySlip` | `selections`, `bankroll`, `riskProfile`, callbacks | Boletín de apuestas combinadas con Kelly stake |
| `DynamicBettingSlip` | `groups`, `bankroll`, `riskProfile`, `onRegisterParlay` | Slip para mercados dinámicos (active markets) |
| `AIAnalysisModal` | `match`, `onClose` | Modal full-screen con análisis Gemini + SGP |
| `LiveTracker` | `match`, `userBets` | Tracker tiempo real con marcador, stats, timeline |
| `DedicatedParlayView` | — | Página completa optimizador parlay |
| `DynamicBettingSlip` | — | Slip mercados dinámicos |
| `AIAnalysisModal` | — | Modal análisis IA |

### 7.3 Hooks Personalizados
- `useLivePolling(endpoint, callback, interval, enabled)` — Polling configurable (60s default) con abort controller

### 7.4 Estado Global (HomePage - useState)
```typescript
matches: Match[]                    // Partidos adaptados (API → UI)
activeSport: Sport | null           // Filtro deporte
searchQuery: string                 // Búsqueda texto
showLiveOnly: boolean               // Solo en vivo
selectedMatchForAnalysis: Match     // Modal IA
parlaySelections: ParlaySelection[] // Selecciones combinada
parlayRiskProfile: RiskProfile      // conservador/moderado/agresivo
dynamicMarketGroups: ActiveMarketGroup[] // Mercados /api/active-markets
bankrollSnapshot: BankrollSnapshot  // Balance, P&L, yield, winRate
activeBets: BetRecord[]             // Apuestas activas
simLocalOdds: number                // Simulador cuota local
selectedSimMatchId: string          // Partido seleccionado simulador
```

---

## 8. Tipado de Dominio (src/types.ts)

### 8.1 Deportes Soportados (12)
```typescript
enum Sport {
  Soccer, Basketball, Baseball, Tennis, Football,    // fútbol americano
  IceHockey, Cricket, RugbyLeague, Golf, MMA, AussieRules
}
```

### 8.2 Estructura `Match` (canónica UI)
- Identificadores, equipos, fecha, countdown, status (live/scheduled/finished)
- `aiProbabilities`: {home, draw?, away} — % IA
- `bookmakerOdds`: {home, draw?, away} — cuotas decimales
- `valueEstimate`: edge detection (aiProb - impliedProb)
- `statistics`: Objeto discriminado por deporte (12 interfaces)
- `recentForm`, `h2hMatches`, `keyInsights`

### 8.3 Mercados Avanzados (SoccerMarketAnalysis)
- `GoalLineMarket` (1.5, 2.5, 3.5) con Poisson λ
- `CornerMarket` (total, home, away, handicap)
- `DisciplineMarket` (tarjetas, puntos booking, referee factor)
- `PlayerPropMarket` (9 tipos: tiros, faltas, pases, tackles, etc.)
- `BTTSMarket` (ambos marcan + clean sheet prob)
- `MatchOutcomeMarket` (1X2 + asian handicap + draw no bet + double chance)
- `ValueBetSignal` unificado: edge, rating, confidence, kelly, stake

---

## 9. Gestión de Bankroll y Riesgo

### 9.1 BankrollManager (localStorage persistente)
- **BetRecord**: id, matchId, sport, league, descripción, selección, odds, stake, aiProbability, edgePercent, valueRating, startsAt, settledAt, result, payout, profitLoss
- **Auto-liquidación**: `autoSettleBets(finishedMatches[])` comparando liveScore
- **Snapshot**: balance, totalWagered, totalWon, netProfitLoss, winRate, yield, openBetsCount

### 9.2 ParlayRiskManager (perfiles)
| Perfil | Max Legs | Min Edge | Kelly Fraction | Max Stake % Bankroll |
|--------|----------|----------|----------------|---------------------|
| conservador | 3 | 8% | 0.25 | 2% |
| moderado | 4 | 5% | 0.5 | 5% |
| agresivo | 5 | 3% | 0.75 | 10% |

### 9.3 ParlayOptimizer
- Entrada: `Match[]` + `bankroll` + `riskProfile`
- Salida: `OptimizationResult` { selections, combinedOdds, combinedProbability, expectedValue, recommendedStake, riskScore }
- Algoritmo: búsqueda greedy + poda por correlación + Kelly fraccional

### 9.4 HedgingCalculator
- Input: apuesta original (odds, stake), cuota actual contraparte
- Output: stake hedge, guaranteed profit, ROI hedgeado

---

## 10. Same Game Parlay (SGP) — Innovación Clave

### 10.1 Generación (Gemini Auditor)
- Prompt exige **correlación táctica válida** (ej: Over 2.5 goles → validar tiros a puerta + córners)
- 3-4 patas máximo
- Validación de coherencia interna

### 10.2 Estructura SGP (AIAnalysisReport.sameGameParlay)
```typescript
{
  isValid: boolean;
  totalOdds: number;           // producto cuotas
  combinedProbability: number; // joint probability 0-100
  confidenceLevel: "alta"|"media"|"baja";
  correlationScore: number;    // 0-100 tactical coherence
  legs: [{
    market: string;            // "Más de 2.5 Goles"
    selection: string;         // "Over 2.5"
    line: number;              // 2.5
    probability: number;       // IA 0-100
    odds: number;              // decimal
    category: "goals"|"shots"|"corners"|"saves"
  }];
  reasoning: string;           // justificación correlación
  warnings: string[];          // contradicciones detectadas
}
```

### 10.3 sameGameParlayEngine.ts (motor local)
- Replica lógica SGP sin Gemini para fallback
- Correlación via matriz de covarianza simplificada

---

## 11. Server.ts — Punto de Entrada Unificado

### 11.1 Rutas Registradas (10)
| Archivo | Prefijo | Descripción |
|---------|---------|-------------|
| `predict.ts` | `/api/predict` | Pipeline principal predicción |
| `upcomingMatches.ts` | `/api/upcoming-matches` | Partidos próximos (Odds API + scraper) |
| `worldCup.ts` | `/api/world-cup` | Fixtures, live, standings Copa del Mundo |
| `activeMarkets.ts` | `/api/active-markets` | Mercados dinámicos normalizados |
| `newsSentiment.ts` | `/api/news-sentiment` | Análisis sentimiento noticias |
| `smartMoney.ts` | `/api/smart-money` | Detección sharp money |
| `hedging.ts` | `/api/hedging` | Calculadora cobertura |
| `monteCarlo.ts` | `/api/monte-carlo` | Simulación Monte Carlo |
| `dailyParlay.ts` | `/api/daily-parlay` | Parlay diario optimizado |
| `sameGameParlay.ts` | `/api/same-game-parlay` | SGP endpoint dedicado |

### 11.2 Modo Desarrollo vs Producción
```typescript
// DEV: Vite middleware (HMR)
const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
app.use(vite.middlewares);

// PROD: Static files + SPA fallback
app.use(express.static(distPath));
app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
```

### 11.3 Gemini Client (Lazy Init)
- Instancia creada on-demand en `getGeminiClient()`
- Evita crash startup si `GEMINI_API_KEY` no configurada
- User-Agent: `aistudio-build`

### 11.4 World Cup Sync (Background Job)
- `initWorldCupSync()` → `setInterval` cada 5 min
- `stopWorldCupSync()` en SIGINT/SIGTERM

---

## 12. Electron — Aplicación de Escritorio

### 12.1 electron/main.cjs
```javascript
// Main process: BrowserWindow + loadURL (dev) o file:// (prod)
// Preload script para contextBridge seguro
// Auto-updater ready (configurado en package.json build)
```

### 12.2 Build Config (package.json > build)
- **appId**: `com.predictor-ia.app`
- **productName**: `Predictor IA`
- **electronVersion**: `30.0.0`
- **asar**: `false` (para acceso .env en runtime)
- **files**: `dist/**`, `electron/**`, `node_modules/**`, `public/**`, `.env`, `package.json`
- **win.target**: `nsis` (installer Windows)
- **nsis.oneClick**: `false` (permite elegir directorio)

### 12.3 Scripts Electron
```bash
npm run electron:dev    # build + electron . (dev)
npm run electron:build  # build + electron-builder --win --config
```
**Output**: `release/win-unpacked/` + `release/Predictor IA Setup 1.0.0.exe`

---

## 13. Caché y Performance

### 13.1 apiCache.ts (In-Memory + TTL)
- `Map<string, {data, expiresAt}>` global
- `TTL`: SPORTS_LIST=6h, UPCOMING=10m, FIXTURES=5m, TEAMS=1h, H2H=30m
- `cacheGetOrSet(key, ttl, factory)` — patrón cache-aside
- `cacheInvalidate(pattern)` — wildcard support (`odds:*`)

### 13.2 Optimizaciones Frontend
- `useMemo` para `parlaySelectionIds` (Set lookup O(1))
- `useCallback` para `autoSettleFinishedBets` (referencia estable)
- Polling condicional: solo si `hasLiveMatches || hasScheduledMatches`
- Virtualización implícita: `filteredMatches.map` renderiza solo visibles

---

## 14. Variables de Entorno (.env)

| Variable | Requerida | Descripción | Fallback |
|----------|-----------|-------------|----------|
| `GEMINI_API_KEY` | No | Análisis táctico + SGP | Mock dataset 8 partidos |
| `THE_ODDS_API_KEY` | No | Cuotas tiempo real | ESPN Scraper |
| `API_FOOTBALL_KEY` | No | Fixtures, H2H, standings | Solo forma sintética |
| `HF_API_KEY` | No | Ensemble LLMs | Solo mathProjection |
| `PORT` | No | Puerto servidor (default 3000) | 3000 |
| `HOST` | No | Bind host (default 0.0.0.0) | 0.0.0.0 |
| `NODE_ENV` | No | `development` | `production` |

---

## 15. Scripts de Desarrollo y Producción

```json
{
  "dev": "tsx server.ts",                                    // Dev: Express + Vite HMR
  "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
  "start": "node dist/server.cjs",                           // Prod: bundle compilado
  "clean": "rm -rf dist server.js",                          // Limpieza
  "lint": "tsc --noEmit",                                    // Typecheck only
  "electron:dev": "npm run build && electron .",             // Electron dev
  "electron:build": "npm run build && electron-builder --win --config"  // .exe installer
}
```

---

## 16. Despliegue y Distribución

### 16.1 Servidor Web (Node.js)
```bash
npm run build
npm start          # Sirve en puerto 3000 (configurable via PORT)
# Requiere: Node 18+, .env con al menos una API key para datos reales
```

### 16.2 Docker (sugerido)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY electron ./electron
COPY public ./public
COPY .env .env
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

### 16.3 Desktop (Windows)
- Ejecutar `npm run electron:build`
- Instalador NSIS en `release/Predictor IA Setup 1.0.0.exe`
- Desinstalador automático incluido
- Auto-updater listo para configurar (electron-updater)

---

## 17. Extensibilidad y Puntos de Integración

### 17.1 Añadir Nuevo Deporte
1. Agregar a `Sport` enum en `types.ts`
2. Añadir sport_keys en `ODDS_SPORT_KEYS` (sportsApi.ts)
3. Implementar `analyze<NuevoDeporte>` en `mathAnalyzer.ts`
4. Añadir caso en `calculateMatchProjection` switch
5. Crear `generate<NuevoDeporte>Stats` en `matchStatsGenerator.ts`
6. Añadir interfaz `<NuevoDeporte>Stats` en `types.ts`
7. Actualizar `SPORTS_TABS` en `data.ts`
8. Añadir icono en `SportSelector.tsx`

### 17.2 Añadir Nuevo Modelo HF
1. Registrar en `MODEL_REGISTRY` (hfModels.ts)
2. Añadir ID a `modelIds` array en `predictEnsemble`

### 17.3 Nuevo Mercado de Apuestas
1. Extender `SoccerMarketAnalysis` en `types.ts`
2. Añadir mapeo en `dynamicMarketMapper.ts`
3. Actualizar `genericParlayEngine.ts` para soportar categoría
4. Añadir UI en `DynamicBettingSlip.tsx`

---

## 18. Limitaciones Conocidas y Trabajo Futuro

| Área | Limitación Actual | Mejora Propuesta |
|------|-------------------|------------------|
| **API-Football** | Solo fútbol | Integrar API-Sports multi-deporte (basketball, hockey, etc.) |
| **Gemini** | Rate limit free tier (15 RPM) | Caché agresivo + cola de requests |
| **HF Models** | Latencia 2-8s por modelo | Streaming + cache de embeddings |
| **Scraper ESPN** | Frágil (cambios HTML) | Migrar a The Odds API completo |
| **Bankroll** | localStorage (single device) | Backend persistente (PostgreSQL + Prisma) |
| **Auth** | No hay autenticación | JWT + roles (free/premium/admin) |
| **Testing** | Sin tests automatizados | Vitest (unit) + Playwright (e2e) |
| **Monitoring** | Solo console.log | OpenTelemetry + Grafana + Sentry |
| **Mobile** | Responsive only | PWA + Capacitor (iOS/Android) |

---

## 19. Créditos y Licencia

- **Autor**: Predictor IA Team
- **Licencia**: Privada (propietaria)
- **Iconos**: Lucide (MIT)
- **Fuentes de datos**: The Odds API, API-Football, ESPN, Hugging Face, Google AI Studio

---

## 20. Quick Start para Desarrolladores

```bash
# 1. Clonar e instalar
git clone <repo>
cd pronósticos-deportivos-ia
npm install

# 2. Configurar entorno
cp .env.example .env
# Editar .env con al menos una API key

# 3. Desarrollo
npm run dev          # http://localhost:3000

# 4. Verificar tipos
npm run lint

# 5. Build producción
npm run build
npm start            # http://localhost:3000 (build)

# 6. App escritorio
npm run electron:dev
npm run electron:build  # Genera .exe en release/
```

---

*Documento generado automáticamente — Actualizado: 2026-09-15*