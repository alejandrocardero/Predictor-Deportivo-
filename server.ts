import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import predictRouter from "./src/routes/predict";
import upcomingMatchesRouter from "./src/routes/upcomingMatches";
import worldCupRouter from "./src/routes/worldCup";
import activeMarketsRouter from "./src/routes/activeMarkets";
import newsSentimentRouter from "./src/routes/newsSentiment";
import smartMoneyRouter from "./src/routes/smartMoney";
import hedgingRouter from "./src/routes/hedging";
import monteCarloRouter from "./src/routes/monteCarlo";
import dailyParlayRouter from "./src/routes/dailyParlay";
import sameGameParlayRouter from "./src/routes/sameGameParlay";
import errorsRouter from "./src/routes/errors";
import { initWorldCupSync, stopWorldCupSync } from "./src/services/worldCupLive";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// ── API Routes ───────────────────────────────────────────────
app.use(predictRouter);
app.use(upcomingMatchesRouter);
app.use(worldCupRouter);
app.use(activeMarketsRouter);
app.use(newsSentimentRouter);
app.use(smartMoneyRouter);
app.use(hedgingRouter);
app.use(monteCarloRouter);
app.use(dailyParlayRouter);
app.use(sameGameParlayRouter);
app.use(errorsRouter);

// Lazy-evaluate Google GenAI client to prevent startup crash if API key is missing
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "") {
      aiInstance = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiInstance;
}

// Fallback analytics database if Gemini is not configured
const MOCK_ANALYSIS_FALLBACK: Record<string, { summary: string; tacticalKey: string; predictionDetail: string; recommendedBet: { bet: string; confidence: number; odds: number } }> = {
  m1: {
    summary: "Simulación de alta fidelidad merengue. Real Madrid posee una probabilidad dominante impulsada por su letal historial en competiciones de eliminación directa y el factor campo neutral de esta final caprichosa.",
    tacticalKey: "La batalla táctica ocurrirá en las bandas. El repliegue de Vinícius Júnior para arrastrar marcas de Kyle Walker liberará espacios cruciales para las diagonales de Jude Bellingham, creando superioridad física en tres cuartos de cancha de la defensa del Manchester City.",
    predictionDetail: "La IA proyecta que el Real Madrid tomará una postura reactiva con transiciones veloces. Las estadísticas defensivas pronostican 4.2 atajadas para Courtois frente al ataque asfixiante conducido por Erling Haaland, sosteniendo el marcador y permitiendo un contraataque triunfante.",
    recommendedBet: {
      bet: "Real Madrid Gana (1X2) - Tiempo Regular",
      confidence: 78,
      odds: 2.45
    }
  },
  m2: {
    summary: "El clásico de filosofías. La posesión extendida del Barcelona buscará desgastar la fortaleza defensiva del muro de Diego Simeone en un encuentro de baja intensidad y alta exigencia estratégica.",
    tacticalKey: "Alineación del Atlético. Oblak será exigido en balones parados y disparos lejanos. Si Ferran Torres y Lewandowski no logran conectar con dinamismo contra la línea de cinco defensores colchoneros, el ritmo se enfriará.",
    predictionDetail: "Modelo estocástico indica 52% de probabilidad para 'Bajo de 2.5 goles'. Ambos equipos se respetarán de más durante los primeros 45 minutos. Los duelos defensivos por aire de Ronald Araújo neutralizarán el ataque aéreo de Antoine Griezmann.",
    recommendedBet: {
      bet: "Menos de 2.5 Goles totales",
      confidence: 82,
      odds: 1.80
    }
  },
  m3: {
    summary: "El choque histórico de la NBA. Celtics entra como favorito por su profunda banca y eficiencia en triples, pero los Lakers en casa con LeBron e Davis mantienen viva la mística competitiva con defensa física extrema.",
    tacticalKey: "El emparejamiento defensivo sobre Jayson Tatum promediando más de 31 puntos en finales. Si Anthony Davis logra tapar la pintura sin acumular faltas tempranas, el juego se inclinará drásticamente hacia el lado oro y púrpura.",
    predictionDetail: "La simulación de 10,000 partidos proyecta alta probabilidad para que Anthony Davis supere su línea combinada de puntos, rebotes y asistencias (40.5) gracias a un ritmo de posesiones dinámicas e intensas transiciones ofensivas conducidas por LeBron James.",
    recommendedBet: {
      bet: "Anthony Davis - Más de 40.5 (Pts + Reb + Ast)",
      confidence: 72,
      odds: 1.85
    }
  },
  m4: {
    summary: "El clásico de la MLB. Yankees defiende el Bronx con Gerrit Cole en la lomita frente a un volátil lineup de los Red Sox que sufre de alto porcentaje de swings fallidos fuera de la zona de strike.",
    tacticalKey: "Control del slider de Gerrit Cole y la propensión de Aaron Judge al cuadrangular ante pitcheo quebrado. Gerrit Cole mantendrá control de la rotación inicial ahogando la ventaja temprana de Boston.",
    predictionDetail: "IA calcula 63% de victoria para Yankees. Gerrit Cole proyecta más de 7.5 ponches (Strikeouts) efectivos. Las transiciones de relevistas favorecen al bullpen de Nueva York en las entradas finales de alta presión.",
    recommendedBet: {
      bet: "Yankees Ganador en Línea de Carrera",
      confidence: 85,
      odds: 1.55
    }
  },
  m5: {
    summary: "Poderío de la costa oeste. Dodgers cuenta con las mayores ventajas ofensivas gracias a un Shohei Ohtani que lidera la probabilidad de jonrón y un pitcheo estelar comandado por Yamamoto.",
    tacticalKey: "El duelo entre Shohei Ohtani y Framber Valdez. El pitcheo zurdo de Valdez intentará neutralizar el swing de Ohtani, pero las simulaciones muestran que la velocidad de salida de los batazos en Dodgers Stadium supera el promedio.",
    predictionDetail: "Proyecciones ofensivas calculan un total de carreras combinadas superior a 9.5 producto de vientos favorables de 12mph hacia el jardín central y un pitcheo de relevistas de Astros altamente castigado esta campaña.",
    recommendedBet: {
      bet: "Más de 9.5 Carreras en el partido",
      confidence: 76,
      odds: 1.95
    }
  },
  m6: {
    summary: "La cima del tenis mundial sobre arcilla. Alcaraz y Sinner reviven el duelo moderno de velocidad en canchas lentas, donde la resistencia física y consistencia con primeros servicios definirán la corona.",
    tacticalKey: "Desgaste acumulado de Jannik Sinner en sus previos duelos a 5 mangas. La explosividad y variedad de golpes cruzados planos con efecto por parte de Alcaraz desgastarán rápido los desplazamientos laterales del italiano.",
    predictionDetail: "El simulador de tenis estima un juego muy igualado con más del 74% de probabilidad de extenderse a un cuarto set. Carlos Alcaraz mantiene una ventaja mental estratégica clave en los primeros sets.",
    recommendedBet: {
      bet: "Carlos Alcaraz Gana el Partido",
      confidence: 68,
      odds: 2.10
    }
  },
  m7: {
    summary: "Djokovic lidera los intercambios en este tercer set en vivo, exhibiendo regularidad en sus golpes profundos, mientras Nadal batalla por recuperar su mejor movilidad en césped.",
    tacticalKey: "Porcentaje de puntos ganados por Djokovic con su primer servicio (el cual se encuentra actualmente en un majestuoso 92%). Esto reduce las oportunidades de quiebre de Nadal al mínimo.",
    predictionDetail: "Alineación en tiempo real. La IA detecta debilidad física de Nadal en apoyo de pie izquierdo tras peloteos de más de 8 golpes. El modelo ajusta la probabilidad en vivo a 62% favor del tenista serbio.",
    recommendedBet: {
      bet: "Novak Djokovic Gana Set 3",
      confidence: 80,
      odds: 1.50
    }
  },
  m8: {
    summary: "Duelo de tiradores en la bahía. Stephen Curry comandará la ofensiva con tiros de larga distancia, buscando estirar la defensa perimetral de Dallas que depende del ritmo que imponga Luka Doncic.",
    tacticalKey: "Defensa del pick-and-roll de Dallas. Si Draymond Green logra incomodar los pases de Luka hacia la esquina, Warriors dominará la racha de transición rápida.",
    predictionDetail: "Se estima un partido cerrado con márgenes menores a 3 puntos de diferencia. Warriors posee un valor oculto debido a la cuota pagada por las casas de apuestas (2.05) comparado con nuestro 51% de probabilidad de triunfo.",
    recommendedBet: {
      bet: "Golden State Warriors +1.5 (Hándicap de puntos)",
      confidence: 71,
      odds: 1.95
    }
  }
};

// API Endpoint to generate detailed AI analysis with Gemini or Fallback
app.post("/api/gemini/analysis", async (req, res) => {
  const { matchId, homeTeam, awayTeam, sport, league } = req.body;

  if (!matchId) {
    return res.status(400).json({ error: "Falta el matchId" });
  }

  const client = getGeminiClient();

  if (!client) {
    // If Gemini client is not configured, reply with beautiful custom mock fallback instantly
    const fallback = MOCK_ANALYSIS_FALLBACK[matchId] || {
      summary: `Análisis detallado de IA para ${homeTeam} vs ${awayTeam}. En este duelo de ${sport}, ambos equipos buscarán imponer su estilo estratégico y táctico.`,
      tacticalKey: "La clave táctica dependerá de la consistencia colectiva y de las ausencias claves por lesión en el mediocampo o rotación de jugadores estrellas.",
      predictionDetail: "Nuestra simulación stocástica evalúa el desempeño histórico directo (H2H), la forma más reciente y las tendencias de probabilidad implícitas de cada uno.",
      recommendedBet: {
        bet: `Hándicap a favor de ${homeTeam}`,
        confidence: 65,
        odds: 1.85
      },
      sameGameParlay: {
        isValid: false,
        totalOdds: 0,
        combinedProbability: 0,
        confidenceLevel: "baja",
        correlationScore: 0,
        legs: [],
        reasoning: "Análisis SGP no disponible sin GEMINI_API_KEY",
        warnings: ["Configura GEMINI_API_KEY para activar Same Game Parlay"]
      }
    };
    return res.json({ ...fallback, isFallback: true });
  }

  try {
    const prompt = `
      Actúa como un analista deportivo profesional de élite y experto en estadísticas probabilísticas.
      Analiza el siguiente enfrentamiento deportivo en español:
      
      Deporte: ${sport}
      Liga/Torneo: ${league}
      Equipo Local (Home): ${homeTeam}
      Equipo Visitante (Away): ${awayTeam}
      Fecha/Detalle: ${req.body.dateTime || "Próximamente"}
      
      Por favor, genera un informe analítico sumamente profesional, con un tono analítico, serio y de confianza financiera (dark mood premium vibes), optimizado para aficionados de apuestas y analistas financieros deportivos.
      No inventes mentiras descabelladas. Tradúcelo todo al español técnico de apuestas (p. ej., 'atajadas', 'cuadrangulares', 'rebotes', 'tiros de esquina').

      INCLUYE ANÁLISIS DE SAME GAME PARLAY:
      - Evalúa mercados secundarios (Over/Under goles, tiros a puerta, córners, atajadas) con probabilidad ≥ 65%
      - Construye una combinada interna coherente de 3-4 patas con correlación táctica válida
      - Verifica coherencia: si predices 'Más de 2.5 goles', valida que tiros a puerta y córners acompañen esa dinámica
      - Reporta cuota total combinada, probabilidad conjunta y nivel de confianza

      Debes devolver el resultado estrictamente en formato JSON utilizando el esquema requerido, sin bloques markdown rústicos alrededor, solo puro JSON válido.
    `;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "Un resumen analítico profundo de alto nivel sobre el enfrentamiento en español. Máximo 4 líneas.",
            },
            tacticalKey: {
              type: Type.STRING,
              description: "La clave táctica fundamental o factor decisivo del partido (estrategia, bajas, duelos clave). Máximo 3 líneas.",
            },
            predictionDetail: {
              type: Type.STRING,
              description: "Desglose técnico de por qué el modelo predictivo de IA proyecta estas probabilidades y el desarrollo esperado. Máximo 3 líneas.",
            },
            recommendedBet: {
              type: Type.OBJECT,
              properties: {
                bet: {
                  type: Type.STRING,
                  description: "Nuestra recomendación específica de apuesta con mayor valor implícito.",
                },
                confidence: {
                  type: Type.INTEGER,
                  description: "Porcentaje de confianza estadística de esta recomendación (de 0 a 100).",
                },
                odds: {
                  type: Type.NUMBER,
                  description: "Cuota de apuestas razonable estimada (p. ej., 1.95).",
                },
              },
              required: ["bet", "confidence", "odds"],
            },
            sameGameParlay: {
              type: Type.OBJECT,
              description: "Análisis de Same Game Parlay (combinada interna del mismo partido)",
              properties: {
                isValid: { type: Type.BOOLEAN, description: "Si se pudo construir una combinada válida" },
                totalOdds: { type: Type.NUMBER, description: "Cuota total multiplicada de la combinada" },
                combinedProbability: { type: Type.NUMBER, description: "Probabilidad conjunta estimada (0-100)" },
                confidenceLevel: { type: Type.STRING, enum: ["alta", "media", "baja"], description: "Nivel de confianza general" },
                correlationScore: { type: Type.INTEGER, description: "Score de correlación táctica 0-100" },
                legs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      market: { type: Type.STRING, description: "Nombre del mercado (ej: Más de 2.5 Goles)" },
                      selection: { type: Type.STRING, description: "Selección específica (ej: Over 2.5)" },
                      line: { type: Type.NUMBER, description: "Línea del mercado" },
                      probability: { type: Type.NUMBER, description: "Probabilidad IA 0-100" },
                      odds: { type: Type.NUMBER, description: "Cuota decimal" },
                      category: { type: Type.STRING, description: "Categoría: goals, shots, corners, saves" },
                    },
                    required: ["market", "selection", "line", "probability", "odds", "category"],
                  },
                },
                reasoning: { type: Type.STRING, description: "Justificación de correlación táctica" },
                warnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Advertencias de contradicciones" },
              },
              required: ["isValid", "totalOdds", "combinedProbability", "confidenceLevel", "correlationScore", "legs", "reasoning", "warnings"],
            },
          },
          required: ["summary", "tacticalKey", "predictionDetail", "recommendedBet", "sameGameParlay"],
        },
      },
    });

    const jsonText = response.text?.trim() || "{}";
    const data = JSON.parse(jsonText);
    res.json({ ...data, isFallback: false });
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    // Graceful recovery on error
    const fallback = MOCK_ANALYSIS_FALLBACK[matchId] || {
      summary: `Análisis detallado de IA para ${homeTeam} vs ${awayTeam}. En este duelo de ${sport}, ambos equipos buscarán imponer su estilo estratégico y táctico.`,
      tacticalKey: "La clave táctica dependerá de la consistencia de los planteamientos y estrellas convocados.",
      predictionDetail: "Proyecciones estocásticas estiman alta fricción física con cierres intensificados en las fases tardías del evento.",
      recommendedBet: {
        bet: `${homeTeam} Ganador`,
        confidence: 60,
        odds: 1.90
      },
      sameGameParlay: {
        isValid: false,
        totalOdds: 0,
        combinedProbability: 0,
        confidenceLevel: "baja",
        correlationScore: 0,
        legs: [],
        reasoning: "Análisis SGP no disponible en modo fallback",
        warnings: ["Requiere GEMINI_API_KEY para análisis de Same Game Parlay"]
      }
    };
    res.json({ ...fallback, isFallback: true, error: error.message });
  }
});

// Configure Vite or Static Assets based on environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT) || PORT;
  app.listen(port, host, () => {
    console.log(`Express server running at http://${host}:${port}`);
    initWorldCupSync();
  });
}

// Register signal handlers on all platforms
process.on("SIGINT", () => {
  stopWorldCupSync();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopWorldCupSync();
  process.exit(0);
});

startServer();
