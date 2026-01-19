# Plan de Implementación - Spec v3.0
**Proyecto:** Conta Residencial / Copropiedad SaaS  
**Fecha:** 2026-01-19  
**Basado en:** [spec_v3.md](./spec_v3.md)

---

## 📋 Resumen Ejecutivo

Este plan implementa las mejoras arquitectónicas y optimizaciones definidas en el spec_v3.md, organizadas en **4 fases priorizadas** por impacto técnico y riesgo operacional.

### Métricas de Éxito
- ✅ **Fase 1:** Eliminación de timeouts en Railway, reglas de IA 100% desde DB
- ✅ **Fase 2:** Reducción de tiempo de debugging en 50%, visibilidad completa de errores
- ✅ **Fase 3:** Reducción de costos de Gemini en 20-30%
- ✅ **Fase 4:** Queries DB <100ms, trazabilidad completa de cambios

---

## 🔴 Fase 1: Cambios Arquitectónicos Críticos (Alta Prioridad)

> [!WARNING]
> **Breaking Changes:** Esta fase incluye cambios que afectan el contrato de API y el comportamiento del sistema. Requiere coordinación con frontend y actualización de documentación.

### 1.1. Prisma Driver Adapters (Preparación Edge Functions)

**Objetivo:** Habilitar soporte para Edge Runtime y optimizar latencia futura.

**Cambios Requeridos:**

#### Schema Prisma
```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]  // ← AÑADIR
}
```

**Pasos de Implementación:**
1. Editar `apps/api/prisma/schema.prisma`
2. Ejecutar `npx prisma generate`
3. Verificar que no haya errores de compilación
4. Commit: `feat(prisma): enable driver adapters for edge runtime`

**Verificación:**
```bash
cd apps/api
npx prisma generate
npm run build
```

**Riesgo:** Bajo (solo preparación, no afecta runtime actual)

---

### 1.2. Feedback de IA Dinámico (Migración DB)

**Objetivo:** Eliminar escritura en `AI_RULES.md` durante runtime, inyectar reglas desde PostgreSQL.

**Estado Actual:**
- ✅ Tabla `AIFeedback` ya existe en schema
- ⚠️ Archivo `AI_RULES.md` contiene reglas que deben migrarse
- ❌ `ai.service.ts` no inyecta reglas desde DB

#### 1.2.1. Añadir Campo `version` a AIFeedback

```prisma
// apps/api/prisma/schema.prisma
model AIFeedback {
  id            String    @id @default(uuid())
  unitId        String    @map("unit_id")
  documentType  String    @map("document_type")
  invoiceId     String?   @map("invoice_id")
  paymentId     String?   @map("payment_id")
  comment       String
  suggestedRule String?   @map("suggested_rule")
  status        String    @default("PENDING")
  version       Int       @default(1)  // ← AÑADIR
  createdAt     DateTime  @default(now()) @map("created_at")
  resolvedAt    DateTime? @map("resolved_at")

  unit    Unit     @relation(fields: [unitId], references: [id])
  invoice Invoice? @relation(fields: [invoiceId], references: [id])
  payment Payment? @relation(fields: [paymentId], references: [id])

  @@map("ai_feedback")
}
```

**Migración:**
```bash
cd apps/api
npx prisma migrate dev --name add_version_to_ai_feedback
```

#### 1.2.2. Crear Función de Inyección Dinámica

**Archivo:** `apps/api/src/services/aiRules.service.ts` (NUEVO)

```typescript
import prisma from '../lib/prisma';

export class AIRulesService {
  /**
   * Construye las reglas personalizadas desde la DB para inyectar en el prompt
   */
  static async buildDynamicRulesFromDB(unitId: string): Promise<string> {
    const feedbackRules = await prisma.aIFeedback.findMany({
      where: { 
        unitId,
        status: { in: ['APPLIED', 'PENDING'] } // Solo reglas activas
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limitar para no exceder token limits
    });

    if (feedbackRules.length === 0) {
      return '';
    }

    const rulesText = feedbackRules
      .map((f, idx) => `${idx + 1}. ${f.suggestedRule || f.comment}`)
      .join('\n');

    return `
REGLAS DE NEGOCIO PERSONALIZADAS (Aprendidas de Feedback):
Las siguientes son reglas específicas de esta unidad. APLÍCALAS CON PRIORIDAD:
${rulesText}
`;
  }

  /**
   * Migra reglas existentes de AI_RULES.md a la base de datos
   */
  static async migrateRulesFromFile(unitId: string, rules: string[]): Promise<void> {
    for (const rule of rules) {
      await prisma.aIFeedback.create({
        data: {
          unitId,
          documentType: 'GENERAL',
          comment: 'Migrado desde AI_RULES.md',
          suggestedRule: rule,
          status: 'APPLIED',
          version: 1
        }
      });
    }
  }
}
```

#### 1.2.3. Modificar `ai.service.ts`

**Archivo:** `apps/api/src/services/ai.service.ts`

```typescript
import { AIRulesService } from './aiRules.service';

export async function classifyAndExtractDocument(
    fileBuffer: Buffer,
    mimeType: string,
    unitId: string
): Promise<{...}> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
    });

    // 1. Fetch Dynamic Context (Prompt + Rules)
    const { description: contextDescription } = await UnitContextService.getUnitContext(unitId);
    
    // 2. Fetch Dynamic Rules from DB (NUEVO)
    const dynamicRules = await AIRulesService.buildDynamicRulesFromDB(unitId);

    const prompt = `Analiza este documento y determina su tipo y extrae la información relevante. NO INVENTES INFORMACIÓN.

    ${contextDescription}
    
    ${dynamicRules}  // ← Inyección dinámica desde DB

    FORMATO DE RESPUESTA (JSON):
    ...
```

**Cambios:**
- ✅ Reemplazar llamada a `UnitContextService.getUnitContext()` que retorna `rules`
- ✅ Usar `AIRulesService.buildDynamicRulesFromDB(unitId)`
- ❌ Eliminar cualquier lógica de escritura en `AI_RULES.md`

#### 1.2.4. Script de Migración

**Archivo:** `apps/api/scripts/migrate-ai-rules.ts` (NUEVO)

```typescript
import { AIRulesService } from '../src/services/aiRules.service';
import prisma from '../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function migrateAIRules() {
  console.log('🔄 Iniciando migración de AI_RULES.md a base de datos...');

  // Leer AI_RULES.md
  const rulesPath = path.join(__dirname, '../../AI_RULES.md');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  // Extraer reglas del archivo (parseo simple)
  const rules = rulesContent
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(rule => rule.length > 10);

  console.log(`📝 Encontradas ${rules.length} reglas en AI_RULES.md`);

  // Obtener todas las unidades
  const units = await prisma.unit.findMany({ select: { id: true, name: true } });

  console.log(`🏢 Migrando reglas a ${units.length} unidades...`);

  for (const unit of units) {
    await AIRulesService.migrateRulesFromFile(unit.id, rules);
    console.log(`  ✅ ${unit.name}`);
  }

  console.log('✨ Migración completada!');
  console.log('⚠️  Recuerda actualizar AI_RULES.md con disclaimer');
}

migrateAIRules()
  .catch(console.error)
  .finally(() => process.exit());
```

**Ejecutar:**
```bash
cd apps/api
npx ts-node scripts/migrate-ai-rules.ts
```

#### 1.2.5. Actualizar AI_RULES.md

Añadir disclaimer al inicio del archivo:

```markdown
# Reglas de Entrenamiento y Exclusión de IA (Conta Residencial)

> [!CAUTION]
> **DEPRECADO (v3.0):** Este archivo es ahora **solo documentación estática**.
> Las reglas activas se almacenan en la tabla `ai_feedback` de PostgreSQL y se inyectan dinámicamente en el context window de Gemini.
> 
> **NO EDITAR MANUALMENTE.** Para añadir reglas, usar el sistema de Feedback en la UI.

---

## Reglas Históricas (Referencia)
...
```

**Verificación:**
```bash
# Verificar que las reglas se inyectan correctamente
curl -X POST http://localhost:3000/api/scan/test-unit-id \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
  
# Revisar logs para confirmar que el prompt incluye reglas desde DB
```

**Riesgo:** Medio (cambio de comportamiento, requiere testing exhaustivo)

---

### 1.3. Arquitectura de Cron Asíncrono

**Objetivo:** Evitar timeouts en Railway para escaneos largos (>30s).

**Estado Actual:**
- ✅ Tabla `ScanningJob` existe (renombrar a `ScanJobs`)
- ❌ No hay sistema de colas configurado
- ❌ Endpoint actual es síncrono

#### 1.3.1. Renombrar Tabla en Schema

```prisma
// apps/api/prisma/schema.prisma
model ScanJob {  // ← Renombrado de ScanningJob
  id             String    @id @default(uuid())
  unitId         String    @map("unit_id")
  status         String    @default("PENDING") // PENDING, RUNNING, COMPLETED, FAILED
  progress       Json?     // { total: 10, processed: 7, failed: 0 }
  results        Json?     // { invoicesCreated: 15, paymentsCreated: 8 }
  error          String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  completedAt    DateTime? @map("completed_at")

  @@map("scan_jobs")  // ← Renombrar tabla
}
```

**Migración:**
```bash
cd apps/api
npx prisma migrate dev --name rename_scanning_job_to_scan_jobs
```

#### 1.3.2. Configurar BullMQ y Redis

**Instalar dependencias:**
```bash
cd apps/api
npm install bullmq ioredis
npm install -D @types/ioredis
```

**Configurar Redis (Railway):**
1. Añadir servicio Redis en Railway
2. Copiar `REDIS_URL` a variables de entorno del API

**Archivo:** `apps/api/src/lib/queue.ts` (NUEVO)

```typescript
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const scanQueue = new Queue('gmail-scan', { connection });

export interface ScanJobData {
  jobId: string;
  unitId?: string; // Si es undefined, escanea todas las unidades
}

export async function addScanJob(data: ScanJobData): Promise<Job> {
  return scanQueue.add('scan', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  });
}
```

#### 1.3.3. Crear Worker

**Archivo:** `apps/api/src/workers/scan.worker.ts` (NUEVO)

```typescript
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '../lib/prisma';
import { ScanJobData } from '../lib/queue';
import { scanUnitGmail } from '../services/gmail.service';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const scanWorker = new Worker<ScanJobData>(
  'gmail-scan',
  async (job: Job<ScanJobData>) => {
    const { jobId, unitId } = job.data;

    console.log(`[Worker] Processing scan job ${jobId}`);

    try {
      // Actualizar estado a RUNNING
      await prisma.scanJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });

      let units;
      if (unitId) {
        units = await prisma.unit.findMany({ where: { id: unitId } });
      } else {
        // Escanear todas las unidades con auto-scan habilitado
        units = await prisma.unit.findMany({
          where: {
            gmailAutoScanEnabled: true,
            gmailToken: { isNot: null },
          },
          include: { gmailToken: true },
        });
      }

      const total = units.length;
      let processed = 0;
      let failed = 0;
      const results: any[] = [];

      for (const unit of units) {
        try {
          const result = await scanUnitGmail(unit.id);
          results.push({ unitId: unit.id, status: 'success', ...result });
          processed++;
        } catch (error: any) {
          results.push({ unitId: unit.id, status: 'error', error: error.message });
          failed++;
        }

        // Actualizar progreso
        await prisma.scanJob.update({
          where: { id: jobId },
          data: {
            progress: { total, processed: processed + failed, failed },
          },
        });

        // Reportar progreso a BullMQ
        await job.updateProgress((processed + failed) / total * 100);
      }

      // Marcar como completado
      await prisma.scanJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          results: { invoicesCreated: results.length, details: results },
          completedAt: new Date(),
        },
      });

      console.log(`[Worker] Job ${jobId} completed: ${processed} success, ${failed} failed`);
    } catch (error: any) {
      console.error(`[Worker] Job ${jobId} failed:`, error);

      await prisma.scanJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: error.message,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  },
  { connection, concurrency: 2 }
);

scanWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

scanWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err);
});

console.log('🚀 Scan worker started');
```

**Iniciar worker:**
```bash
cd apps/api
npx ts-node src/workers/scan.worker.ts
```

#### 1.3.4. Refactorizar Endpoint Cron

**Archivo:** `apps/api/src/routes/scan.ts`

```typescript
import { Router } from 'express';
import { addScanJob } from '../lib/queue';
import prisma from '../lib/prisma';

const router = Router();

// Nuevo endpoint asíncrono
router.post('/cron/scan-all', async (req, res) => {
  const cronSecret = req.headers['x-cron-secret'];
  
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Crear job en DB
    const scanJob = await prisma.scanJob.create({
      data: {
        unitId: null, // null = escanear todas
        status: 'PENDING',
        progress: { total: 0, processed: 0, failed: 0 },
      },
    });

    // Añadir a cola
    await addScanJob({ jobId: scanJob.id });

    // Retornar 202 Accepted inmediatamente
    return res.status(202).json({
      status: 'accepted',
      jobId: scanJob.id,
      message: 'Scan job queued',
      statusUrl: `/api/scan/jobs/${scanJob.id}`,
    });
  } catch (error: any) {
    console.error('Error queueing scan job:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint para consultar estado del job
router.get('/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await prisma.scanJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      results: job.results,
      startedAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
```

#### 1.3.5. Actualizar Servicio Cron

**Archivo:** `apps/cron/index.js`

```javascript
const axios = require('axios');

const API_URL = process.env.API_URL;
const CRON_SECRET = process.env.CRON_SECRET;

async function triggerScan() {
  console.log(`[${new Date().toISOString()}] Triggering scan-all...`);

  try {
    const response = await axios.post(
      `${API_URL}/api/scan/cron/scan-all`,
      {},
      {
        headers: { 'x-cron-secret': CRON_SECRET },
        timeout: 10000, // 10s timeout (solo para recibir 202)
      }
    );

    console.log(`✅ Status: ${response.status}`);
    console.log(`📦 Response:`, response.data);

    // Si es 202, opcionalmente consultar estado
    if (response.status === 202 && response.data.jobId) {
      console.log(`🔍 Job ID: ${response.data.jobId}`);
      console.log(`📊 Status URL: ${response.data.statusUrl}`);
      
      // Opcional: Polling del estado
      // await pollJobStatus(response.data.jobId);
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }

  process.exit(0);
}

triggerScan();
```

**Verificación:**
```bash
# Test local
cd apps/cron
API_URL=http://localhost:3000 CRON_SECRET=test-secret node index.js

# Verificar job status
curl http://localhost:3000/api/scan/jobs/{JOB_ID}
```

**Riesgo:** Alto (cambio de arquitectura, requiere Redis, testing extensivo)

---

## 🟡 Fase 2: Observabilidad (Alta Prioridad)

### 2.1. Logging Estructurado

**Objetivo:** Reemplazar `console.log` por logging estructurado con niveles.

**Instalar Winston:**
```bash
cd apps/api
npm install winston
```

**Archivo:** `apps/api/src/lib/logger.ts` (NUEVO)

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'conta-residencial-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Añadir requestId al contexto
export function addRequestId(requestId: string) {
  return logger.child({ requestId });
}

export default logger;
```

**Reemplazar en archivos críticos:**
- `src/services/ai.service.ts`
- `src/routes/scan.ts`
- `src/workers/scan.worker.ts`

```typescript
// Antes
console.log('Processing scan...');
console.error('Error:', error);

// Después
import logger from '../lib/logger';

logger.info('Processing scan', { unitId, jobId });
logger.error('Scan failed', { error: error.message, stack: error.stack });
```

---

### 2.2. Tracing de IA

**Objetivo:** Registrar métricas de cada llamada a Gemini API.

**Schema:**
```prisma
model GeminiMetric {
  id            String   @id @default(uuid())
  unitId        String   @map("unit_id")
  operation     String   // 'classify', 'extract', 'chat', etc.
  model         String   // 'gemini-2.0-flash'
  promptTokens  Int      @map("prompt_tokens")
  responseTokens Int     @map("response_tokens")
  latencyMs     Int      @map("latency_ms")
  success       Boolean
  error         String?
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("gemini_metrics")
}
```

**Wrapper:**
```typescript
// apps/api/src/lib/geminiWrapper.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from './prisma';
import logger from './logger';

export async function trackGeminiCall<T>(
  operation: string,
  unitId: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const latencyMs = Date.now() - startTime;

    await prisma.geminiMetric.create({
      data: {
        unitId,
        operation,
        model: 'gemini-2.0-flash',
        promptTokens: 0, // Gemini no expone esto aún
        responseTokens: 0,
        latencyMs,
        success: true,
      },
    });

    logger.info('Gemini API call succeeded', { operation, latencyMs });
    return result;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    await prisma.geminiMetric.create({
      data: {
        unitId,
        operation,
        model: 'gemini-2.0-flash',
        promptTokens: 0,
        responseTokens: 0,
        latencyMs,
        success: false,
        error: error.message,
      },
    });

    logger.error('Gemini API call failed', { operation, error: error.message });
    throw error;
  }
}
```

---

### 2.3. Health Checks

**Endpoint:** `apps/api/src/routes/health.ts` (NUEVO)

```typescript
import { Router } from 'express';
import prisma from '../lib/prisma';
import { scanQueue } from '../lib/queue';

const router = Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'unknown',
      redis: 'unknown',
      gemini: 'unknown',
    },
  };

  // Check DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }

  // Check Redis
  try {
    await scanQueue.client.ping();
    health.checks.redis = 'ok';
  } catch (error) {
    health.checks.redis = 'error';
    health.status = 'degraded';
  }

  // Check Gemini (simple)
  health.checks.gemini = process.env.GEMINI_API_KEY ? 'ok' : 'missing_key';

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
```

---

## 🟢 Fase 3: Optimización de Costos (Media Prioridad)

### 3.1. Prompt Compression

**Objetivo:** Reducir tokens en 20% sin perder precisión.

**Auditoría:**
1. Analizar prompts actuales en `ai.service.ts`
2. Identificar redundancias
3. Usar técnicas de compresión:
   - Eliminar ejemplos verbosos
   - Usar abreviaciones consistentes
   - Consolidar instrucciones repetidas

**Ejemplo:**
```typescript
// Antes (verbose)
const prompt = `Analiza este documento y determina su tipo y extrae la información relevante. 
NO INVENTES INFORMACIÓN. Si no encuentras un dato, déjalo vacío.

FORMATO DE RESPUESTA (JSON):
Si es INVOICE:
{
  "type": "INVOICE",
  "data": {
    "nit": "NIT del emisor",
    ...
  }
}
...
`;

// Después (comprimido)
const prompt = `Clasifica y extrae datos del documento. NO inventes.

JSON:
INVOICE: { type:"INVOICE", data:{ nit, providerName, invoiceNumber, totalAmount, date, concept }}
PAYMENT_RECEIPT: { type:"PAYMENT_RECEIPT", data:{ bankName, transactionRef, totalAmount, date, concept }}
OTHER: { type:"OTHER" }
`;
```

---

### 3.2. Caching de Contexto

**Objetivo:** Reutilizar contexto de unidad entre llamadas.

```typescript
// apps/api/src/services/ai.service.ts
import { GoogleGenerativeAI, CachedContent } from '@google/generative-ai';

const contextCache = new Map<string, CachedContent>();

export async function getOrCreateCachedContext(unitId: string): Promise<CachedContent> {
  if (contextCache.has(unitId)) {
    return contextCache.get(unitId)!;
  }

  const { description } = await UnitContextService.getUnitContext(unitId);
  const dynamicRules = await AIRulesService.buildDynamicRulesFromDB(unitId);

  const cached = await genAI.cacheContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: description + dynamicRules }] }],
    ttlSeconds: 3600, // 1 hora
  });

  contextCache.set(unitId, cached);
  return cached;
}
```

---

### 3.3. Dashboard de Costos

**Frontend:** `apps/web/src/pages/GeminiCostsDashboard.tsx` (NUEVO)

```tsx
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export function GeminiCostsDashboard() {
  const { data } = useQuery({
    queryKey: ['gemini-costs'],
    queryFn: () => fetch('/api/gemini/costs').then(r => r.json()),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Costos de Gemini API</h1>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-card shadow-card">
          <p className="text-sm text-gray-600">Llamadas este mes</p>
          <p className="text-3xl font-bold">{data?.totalCalls}</p>
        </div>
        <div className="bg-white p-4 rounded-card shadow-card">
          <p className="text-sm text-gray-600">Latencia promedio</p>
          <p className="text-3xl font-bold">{data?.avgLatency}ms</p>
        </div>
        <div className="bg-white p-4 rounded-card shadow-card">
          <p className="text-sm text-gray-600">Tasa de éxito</p>
          <p className="text-3xl font-bold">{data?.successRate}%</p>
        </div>
      </div>

      <BarChart width={800} height={300} data={data?.dailyUsage}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="calls" fill="#4F46E5" />
      </BarChart>
    </div>
  );
}
```

**Backend:** `apps/api/src/routes/gemini.ts` (NUEVO)

```typescript
router.get('/costs', async (req, res) => {
  const { unitId } = req.query;

  const metrics = await prisma.geminiMetric.findMany({
    where: unitId ? { unitId: unitId as string } : {},
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const totalCalls = metrics.length;
  const successRate = (metrics.filter(m => m.success).length / totalCalls) * 100;
  const avgLatency = metrics.reduce((sum, m) => sum + m.latencyMs, 0) / totalCalls;

  res.json({ totalCalls, successRate, avgLatency, dailyUsage: [...] });
});
```

---

## 🔵 Fase 4: Escalabilidad (Baja Prioridad)

### 4.1. Database Optimization

**Índices Compuestos:**
```prisma
model Invoice {
  ...
  @@index([unitId, createdAt])
  @@index([unitId, status])
}

model Payment {
  ...
  @@index([unitId, paymentDate])
}

model GeminiMetric {
  ...
  @@index([unitId, createdAt])
  @@index([operation, success])
}
```

**Connection Pooling:**
```typescript
// apps/api/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
  // Optimización de pool
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
  },
});
```

---

### 4.2. Audit Trail

**Schema:**
```prisma
model AuditTrail {
  id         String   @id @default(uuid())
  unitId     String   @map("unit_id")
  userId     String?  @map("user_id")
  action     String   // CREATE, UPDATE, DELETE
  entity     String   // Invoice, Payment, Provider
  entityId   String   @map("entity_id")
  changes    Json?    // Diff de cambios
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  @@map("audit_trail")
  @@index([unitId, createdAt])
  @@index([entity, entityId])
}
```

**Middleware:**
```typescript
// apps/api/src/middleware/audit.middleware.ts
export function auditMiddleware(entity: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      // Log audit trail
      prisma.auditTrail.create({
        data: {
          unitId: req.user.unitId,
          userId: req.user.id,
          action: req.method,
          entity,
          entityId: data.id,
          changes: data,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      }).catch(console.error);

      return originalJson(data);
    };

    next();
  };
}
```

---

## 📊 Plan de Verificación

### Verificación Automática

**Archivo:** `apps/api/tests/spec-v3-compliance.test.ts` (NUEVO)

```typescript
import { describe, it, expect } from 'vitest';
import prisma from '../src/lib/prisma';
import { AIRulesService } from '../src/services/aiRules.service';

describe('Spec v3.0 Compliance', () => {
  it('should have driverAdapters enabled in Prisma', async () => {
    // Verificar que Prisma se generó con driver adapters
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it('should inject AI rules from database', async () => {
    const rules = await AIRulesService.buildDynamicRulesFromDB('test-unit-id');
    expect(rules).toContain('REGLAS DE NEGOCIO PERSONALIZADAS');
  });

  it('should return 202 for async cron endpoint', async () => {
    const response = await fetch('http://localhost:3000/api/scan/cron/scan-all', {
      method: 'POST',
      headers: { 'x-cron-secret': process.env.CRON_SECRET! },
    });
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data).toHaveProperty('jobId');
  });
});
```

### Verificación Manual

**Checklist:**
- [ ] Escaneo de 10+ unidades completa sin timeout
- [ ] Reglas de feedback se aplican correctamente en siguiente escaneo
- [ ] Logs estructurados visibles en consola con niveles
- [ ] Dashboard de costos muestra datos reales
- [ ] Health check retorna 200 con todos los servicios OK

---

## 🚀 Orden de Implementación Recomendado

1. **Semana 1:** Fase 1.1 + 1.2 (Prisma + Feedback Dinámico)
2. **Semana 2:** Fase 1.3 (Cron Asíncrono) - Requiere Redis
3. **Semana 3:** Fase 2 (Observabilidad completa)
4. **Semana 4:** Fase 3 (Optimización de costos)
5. **Semana 5:** Fase 4 (Escalabilidad)

---

## ⚠️ Riesgos y Mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Timeout en migración de reglas | Media | Bajo | Ejecutar script fuera de horario pico |
| Redis no disponible en Railway | Baja | Alto | Configurar Redis antes de desplegar worker |
| Breaking change en API cron | Alta | Medio | Mantener endpoint legacy hasta confirmar |
| Pérdida de reglas en migración | Baja | Alto | Backup de AI_RULES.md antes de migrar |

---

## 📚 Referencias

- [Spec v3.0](./spec_v3.md)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Gemini API Caching](https://ai.google.dev/gemini-api/docs/caching)
- [Winston Logger](https://github.com/winstonjs/winston)
