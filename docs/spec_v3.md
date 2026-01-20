# Documento de Especificación Técnica (SDD) - v3.0
Proyecto: Conta Residencial / Copropiedad SaaS

# 1. Definición del Stack Tecnológico (Estándar de Oro)
Para mantener la consistencia en el monorepo, toda nueva funcionalidad debe seguir estrictamente:

- **Frontend**: React 18 (Vite) + Tailwind CSS. Componentes deben ser funcionales y usar Lucide React.
- **Backend**: Node.js (Express 5) con TypeScript.
- **Persistencia**: PostgreSQL + Prisma (Naming Convention: **PascalCase** para modelos y `@@map` para tablas).
- **Validación**: Uso obligatorio de **Zod** para esquemas de entrada (API y Formularios).
- **IA**: Agentes basados en Gemini 2.0 Flash. Los prompts deben ser dinámicos (inyectados desde DB), **nunca hardcoded**.

# 2. Arquitectura de Datos y Tipado
Cualquier entidad nueva debe integrarse al esquema de Prisma existente.

- **Modelo de Datos**: 
  - Modelos en PascalCase (`Unit`, `Invoice`, `Provider`).
  - Mapeo a tablas snake_case (`@@map("units")`, etc.) para compatibilidad con DB existente.
  - `Unit` posee `aiCustomPrompt` para personalizar el comportamiento del agente.
- **Seguridad**: Toda query debe filtrar por `unitId` para asegurar el aislamiento entre copropiedades (Multi-tenancy).

> [!IMPORTANT]
> **Restricción Técnica para Prisma**: Asegurar el uso de `previewFeatures = ["driverAdapters"]` en `schema.prisma` para optimizar latencia en futuras Edge Functions. Esta configuración prepara el proyecto para despliegues serverless de baja latencia y compatibilidad con entornos edge como Vercel Edge Runtime o Cloudflare Workers.

# 3. Capa de Validación (Implementada)
Se ha establecido un estándar de validación robusto utilizando **Zod**.

- **Ubicación**: `apps/api/src/schemas/`
- **Esquemas Críticos**:
  - `invoice.schema.ts`: Valida creación de facturas (montos positivos, fechas, UUIDs).
  - `provider.schema.ts`: Valida creación de proveedores (NIT, Email, Tipos de documento).
- **Integración**: Middleware o validación directa en controladores (`schema.safeParse`).

## 3.1. Diccionario de Datos Estándar (Enums)
Para garantizar la integridad referencial, se deben usar estrictamente estos valores en Frontend y Backend:

### Provider Tax Types
| Valor (Backend) | Etiqueta UI | Descripción |
|:---|:---|:---|
| `NIT` | NIT (Persona Jurídica) | Número de Identificación Tributaria |
| `CC` | Cédula de Ciudadanía | Persona Natural Residente |
| `CE` | Cédula de Extranjería | Extranjero Residente |
| `RUT` | RUT (Persona Natural) | Registro Único Tributario (Sin NIT Formal) |

### Account Types
| Valor (Backend) | Etiqueta UI |
|:---|:---|
| `AHORROS` | Ahorros |
| `CORRIENTE` | Corriente |

# 4. Servicios Core (Implementados)
Lógica de negocio encapsulada en servicios puros.

- **UnitContextService** (`src/services/unitContext.service.ts`):
  - Construye el contexto para la IA.
  - Inyecta `aiCustomPrompt` dinámicamente.
  - Elimina nombres de conjuntos "hardcoded".
- **AccountingService** (`src/services/accounting.service.ts`):
  - Motor de cálculo fiscal colombiano.
  - Constantes UVT actualizadas (2025: 49,799).
  - Cálculo automático de Retefuente y ReteICA basado en bases y tarifas configurables.

# 5. UI/UX - Theme Maestro (Implementado)
Sistema de diseño unificado en Tailwind CSS aplicado globalmente.

- **Configuración**: `apps/web/tailwind.config.js` define la identidad visual completa.
- **Tokens Semánticos**:
  - `colors.brand`: Escala 50-950 (Primary: Blue/Indigo).
  - `borderRadius`: `card` (12px), `button` (8px), `input` (8px).
  - `boxShadow`: `card`, `card-hover`.
- **Cobertura**: Theme aplicado en todas las páginas críticas:
  - `UnitsPage`
  - `ReportsHubPage`
  - `RecurrenceConfigPage`
  - `ProvidersPage`
  - `InvoicesPage`
  - `PaymentsPage`
  - `MonthlyClosurePage`
  - `DashboardPage`

## 5.1. Manejo de Modales (Stacking Context)
Regla arquitectónica crítica para evitar problemas de visualización ("pantalla gris" o overlays incorrectos).

- **Problema**: `animate-fade-in` (o cualquier `transform`) crea un nuevo *stacking context*, rompiendo el `z-index` de hijos con `position: fixed`.
- **Solución**: Los Modales **NUNCA** deben ser hijos directos de contenedores animados.
- **Implementación**:
  1. Componente Page (`return`): Usar React Fragment `<>` como raíz.
  2. Contenido principal dentro de `<div className="animate-fade-in">`. 
  3. Modales ubicados **FUERA** del `div` animado, cerrando el Fragment.

```tsx
return (
  <>
    <div className="animate-fade-in">
       {/* Contenido de página, tablas, etc */}
    </div>

    {/* Modales fuera del contexto de animación */}
    {showModal && <MyModal />}
  </>
)
```

# 6. Objetivos Cumplidos (Refactor Q1 2026)
- [x] **Unificación de DB**: Renombrado a modelos PascalCase.
- [x] **Abstracción de IA**: Sistema de prompts dinámicos implementado.
- [x] **Validación**: Zod integrado en rutas críticas.
- [x] **Lógica Fiscal**: Servicio contable desacoplado.
- [x] **Limpieza de UI/UX**: Theme Maestro aplicado en toda la plataforma refactorizada.
- [x] **Gmail Center**: Escaneo de inbox centralizado en Dashboard.
- [x] **Extracción de Fechas**: Estándar DD/MM/YYYY implementado para documentos colombianos.

# 7. Gmail Center - Integración Centralizada (Implementado)
Patrón UX para el escaneo de facturas y egresos desde Gmail.

- **Ubicación Central**: `DashboardPage.tsx` contiene la tarjeta "Centro de Gmail".
- **Componentes**:
  - `AIProcessingOverlay`: Muestra progreso de escaneo con IA.
  - `GmailPreviewModal`: Previsualización de últimos 10 correos.
- **Flujo de Usuario**:
  1. Dashboard muestra estado de conexión Gmail (`getGmailStatus`).
  2. Botón "Ver Buzón" abre modal de previsualización.
  3. Botón "Escanear Inbox" inicia procesamiento IA (`startBackgroundScan` via `AIContext`).
  4. Alerta "X items importados requieren revisión" con links directos a Facturas/Egresos.
- **Páginas Simplificadas**:
  - `InvoicesPage`: Solo muestra indicador de conexión + link "Escanear Inbox →" al Dashboard.
  - `PaymentsPage`: Solo muestra indicador de conexión + link "Escanear Inbox →" al Dashboard.
- **Contexto Global**: `useAI()` de `AIContext.tsx` maneja estado de escaneo entre páginas.

# 8. Formato de Moneda Centralizado (Implementado)
Utilidad única para formateo consistente de moneda colombiana (COP).

- **Ubicación**: `apps/web/src/lib/format.ts`
- **Funciones Disponibles**:
  - `formatMoney(value)`: Display con símbolo `$ 157.005`
  - `formatInputMoney(value)`: Sin símbolo `157.005`
  - `parseInputMoney(string)`: Convierte string formateado a número
- **Cobertura**: Todas las páginas usan la utilidad centralizada:
  - `DashboardPage`, `InvoicesPage`, `PaymentsPage`
  - `MonthlyClosurePage`, `ProviderDetailPage`
  - `pdfGenerator.ts`
- **Componente Opcional**: `MoneyInput.tsx` para inputs con formateo onBlur

# 9. Configuración de Etiquetado Gmail (Implementado)
Sistema para marcar correos procesados y evitar reprocesamiento.

- **Ubicación UI**: Unidades → Editar → Integraciones
- **Campos de Configuración**:
  - `gmailProcessedLabel`: Nombre de la etiqueta (default: "Procesado")
  - `gmailLabelingEnabled`: Toggle para activar/desactivar

| Estado Toggle | Comportamiento |
|:--------------|:---------------|
| ⚪ Desactivado | Modo prueba - correos NO se marcan, permite escanear múltiples veces |
| 🟢 Activo | Correos procesados reciben etiqueta en Gmail |

- **Backend** (`scan.ts`):
  - Verifica `unit.gmailLabelingEnabled` antes de etiquetar
  - Usa `ensureLabel(unitId, labelName)` con nombre configurable
  - Solo ejecuta `markAsProcessed()` si toggle activo y labelId válido
- **Default**: `true` - etiquetado activo por defecto para optimizar costos de IA y evitar reprocesamiento

# 10. Escaneo Automático y Días Relativos (Implementado)
Sistema de escaneo programado con rango de búsqueda configurable.

- **Ubicación UI**: Unidades → Editar → Integraciones → Configuración del Escáner
- **Campos de Configuración**:
  - `gmailScanDaysBack`: Número de días hacia atrás (default: 7)
  - `gmailAutoScanEnabled`: Toggle para activar escaneo automático
  - `gmailLastAutoScan`: Timestamp del último escaneo exitoso (Manual o Automático)

| Campo | Propósito |
|:------|:----------|
| Días relativos | Escanea "últimos X días" en vez de fecha fija |
| Auto-scan | Ejecuta escaneo cada hora automáticamente |
| Last Scan Indicator | Muestra tiempo relativo (ej: "Hace 5 min") en Dashboard e Invoices. |

- **Sincronización en Tiempo Real** (`web/src/lib/AIContext.tsx`):
  - El sistema utiliza `queryClient.invalidateQueries({ queryKey: ['units'] })` inmediatamente después de que un escaneo (manual o automático) finaliza.
  - Esto garantiza que el indicador "Último escaneo" se actualice en toda la UI sin necesidad de recargar la página.
  - Utilidad `formatRelativeTime` (`lib/dateUtils.ts`) para visualización amigable.

## 10.1. Arquitectura de Cron (Implementada)

> [!NOTE]
> **Estado de Implementación**: La arquitectura asíncrona de jobs está **COMPLETAMENTE IMPLEMENTADA**, incluyendo el código de retorno `202 Accepted`.

### Especificación del Endpoint Asíncrono

**Endpoint**: `POST /api/scan/cron/scan-all` (o `GET` para Vercel Cron)

**Comportamiento Actual** (✅ Implementado):
1. ✅ **Procesamiento en Background**: El escaneo se ejecuta de forma asíncrona mediante `runBackgroundScan()`.
2. ✅ **Job Tracking**: Cada escaneo crea un registro en tabla `ScanningJob`.
3. ✅ **Monitoreo de Estado**: Endpoint `GET /api/scan/scan-status/:jobId` para consultar progreso.
4. ✅ **Retorno Inmediato**: Retorna `202 Accepted` para confirmar que la solicitud fue recibida.

**Estructura de Respuesta Actual**:
```json
{
  "success": true,
  "message": "Auto-scan started for X units",
  "scanned": 3,
  "jobs": [
    { "unitId": "uuid", "unitName": "Conjunto A", "jobId": "job-uuid-1" },
    { "unitId": "uuid", "unitName": "Conjunto B", "jobId": "job-uuid-2" }
  ]
}
```

**Estructura de Job Status** (`GET /api/scan/scan-status/:jobId`) - ✅ Implementado:
```json
{
  "id": "job-uuid",
  "unitId": "unit-uuid",
  "status": "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  "progress": 75,
  "totalItems": 20,
  "processedCount": 15,
  "results": [
    { "status": "created", "type": "invoice", "id": "inv-uuid", "file": "factura.pdf" }
  ],
  "error": null,
  "createdAt": "2026-01-19T10:00:00Z",
  "updatedAt": "2026-01-19T10:05:00Z",
  "completedAt": "2026-01-19T10:08:32Z" | null
}
```

### Arquitectura de Servicio (`apps/cron`) - ✅ Implementado

- ✅ **Microservicio Independiente**: `apps/cron/index.js` implementado.
- ✅ **Endpoint Objetivo**: Llama a `POST /api/scan/cron/scan-all`.
- ✅ **Variables de Entorno**:
  - `API_URL`: URL pública de producción Railway.
  - `CRON_SECRET`: Token de autenticación.
- ✅ **Comportamiento**:
  - Ejecuta según schedule Railway.
  - Realiza petición HTTP POST al API.
  - Loggea respuesta completa (status + body).
  - Termina con `process.exit(0)` o `process.exit(1)`.

### Backend (`apps/api/src/routes/scan.ts`) - ✅ Implementado

**Tabla de Base de Datos** - ✅ `ScanningJob`:
```prisma
model ScanningJob {
  id             String    @id @default(uuid())
  unitId         String    @map("unit_id")
  status         String    @default("PENDING") // PENDING, PROCESSING, COMPLETED, FAILED
  progress       Int       @default(0)
  totalItems     Int       @default(0)
  processedCount Int       @default(0)
  results        Json?     // Array of results
  error          String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  completedAt    DateTime? @map("completed_at")

  @@map("scanning_jobs")
}
```

**Rutas Implementadas**:
- ✅ `POST /api/scan/cron/scan-all` - Crea jobs y ejecuta en background (línea 404-471)
- ✅ `GET /api/scan/scan-status/:jobId` - Consulta estado de job (línea 28-38)
- ✅ `POST /api/scan/scan-gmail` - Escaneo manual por unidad (línea 368-384)

**Lógica de Procesamiento** - ✅ Implementada:
1. ✅ Validar autenticación con `CRON_SECRET`.
2. ✅ Crear Job en tabla `ScanningJob` con status `PENDING`.
3. ✅ Ejecutar `runBackgroundScan(jobId, unitId)` de forma no bloqueante.
4. ✅ Filtrar units con `gmailAutoScanEnabled = true` y Gmail conectado.
5. ✅ Actualizar `gmailLastAutoScan` timestamp.
6. ✅ Actualizar estado del job conforme avanza (progress, processedCount, results).
7. ✅ Marcar job como `COMPLETED` o `FAILED` al finalizar.

**Prioridad de filtro** - ✅ Implementada: Días relativos (`gmailScanDaysBack`) > Default 1 día

## 10.2. Visualización Estándar de Archivos (Multi-formato)

Para garantizar que los documentos (PDF) e imágenes (PNG/JPG) se visualicen correctamente sin importar su origen (Cloudinary RAW, Secure URLs o local), se debe seguir este flujo lógico:

1.  **Imágenes**: Siempre se deben abrir directamente usando `window.open(url, '_blank')`.
2.  **PDFs (Especiales)**: Si la URL contiene `/raw/upload/` o termina en `.pdf_secure`, se debe usar un cargador intermedio:
    - `fetch(url)` para obtener el stream.
    - Conversión a `Blob` con tipo `application/pdf`.
    - Apertura mediante `URL.createObjectURL(blob)`.
3.  **PDFs (Estándar)**: Apertura directa.

| Tipo de Archivo | Detección | Comportamiento |
|:---|:---|:---|
| Imagen | Regex `\.(jpg|jpeg|png|webp|gif)$` | `window.open()` directo |
| PDF Secure/Raw | Contiene `_secure` o `/raw/` | Fetch + Blob Conversion |

## 10.3. Ajustes Realizados (Enero 2026)

1. **Código de Respuesta HTTP** (1 línea):
   - Cambiar línea 460 de `scan.ts`: `res.status(202).json({ ... })`
   - Actualizar `apps/cron/index.js` para aceptar código `202` (línea 59)

2. **Estructura de Respuesta** (opcional):
   - Añadir campo `status: "accepted"` en respuesta
   - Añadir campo `estimatedDuration` calculado
   - Añadir campo `statusUrl` con ruta completa

# 11. Motor de Inferencia Fiscal (IA Híbrida)
> **Implementado**: Sistema inteligente para la sugerencia de retenciones fiscales en facturas.

- **Objetivo**: Reducir la carga operativa sugiriendo valores contables (Retefuente, ReteICA) basados en el análisis del documento y normas nacionales.
- **Componentes**:
  - `ai.service.ts`: Prompt enriquecido con normas Colombia 2025 (UVT $49.799, Bases Servicios/Compras).
  - `InvoicesPage.tsx`: Lógica de prioridad en UI.

## 11.1. Lógica de Prioridad (Cascade)
El sistema decide qué valor mostrar en los campos de retención siguiendo este orden estricto:

1.  **Configuración del Proveedor (Alta Prioridad)**:
    - Si el proveedor tiene `defaultRetefuentePerc > 0`, se calcula y **sobrescribe** cualquier otro valor.
    - *Razón*: La configuración explícita del contador sobre el tercero es la fuente de verdad.

2.  **Sugerencia de IA (Media Prioridad)**:
    - Si el proveedor NO tiene configuración (0%), se acepta el valor sugerido por la IA (`suggestedRetentions`).
    - La IA puede haber extraído el valor impreso o haberlo calculado por inferencia de concepto.

3.  **Manual (Intervención)**:
    - El usuario siempre puede editar el campo final.

## 11.2. Estándar de Extracción de Fechas (Patrón Colombiano)
> **Implementado**: Lógica robusta para evitar la confusión entre Mes y Día en documentos locales.

Para garantizar la precisión en facturas colombianas (donde `02/01/2026` es 2 de Enero y no 1 de Febrero), se ha establecido el siguiente estándar:

- **Prompting**: El system prompt instruye explícitamente a la IA sobre el formato `DD/MM/YYYY` predominante en Colombia.
- **Backend (Robustness)**: Implementación de `parseRobusDate` que prioriza el patrón `DD/MM/YYYY` si el parseo ISO falla o es ambiguo.

---

### 11.3. Estándar de Cierre Mensual (Reporting)
- **Botones de Reporte**: Deben estar habilitados si existe al menos **un egreso** pagado O **una factura** pendiente en el periodo.
- **Modales de Reporte**: Deben seguir el layout de Modales `spec_v3` (encabezados y pies fijos, backdrop-blur-sm, shadow-2xl).

#### Condiciones Obligatorias para el Cierre:
1.  **Existencia de Movimientos**: Al menos un pago o factura pendiente sin reportar en el rango de fechas.
2.  **Vínculo Documental**: Si un pago indica "Tiene factura", el cierre se bloquea hasta que la factura esté vinculada.
3.  **Garantía de Soportes**: Los egresos incluidos deben tener Soporte de Pago (Recibo bancario) y las facturas su PDF/Imagen original para la Carpeta Contable.
4.  **Confirmación de Usuario**: Resumen explícito del conteo de documentos antes de la ejecución definitiva.

- **Apertura de Archivos**: Uso de la única función estándar `openFileUrl` (con fetch + blob para PDFs) para garantizar visualización sin errores de CORS.

### Lógica de Referencia (parseRobusDate)
```typescript
function parseRobusDate(dateStr: string): Date {
    // 1. Prioriza ISO si el formato es claro (YYYY-MM-DD)
    // 2. Si detecta separadores (/ o -) intenta patrón DD/MM/YYYY
    // 3. Conversión manual: new Date(year, month - 1, day)
}
```

# 12. Asistente Financiero (CFO Virtual)
> **Implementado**: Interfaz de chat flotante para consultas en lenguaje natural sobre el estado financiero.

- **Componente UI**: `AIChatWidget.tsx` (Botón flotante en esquina inferior derecha).
- **Estilos**: Requiere clases `.ai-gradient` y `.ai-pulse` en `index.css`.
- **Renderizado Rico (UX)**:
  - Implementa `react-markdown` + `remark-gfm` para soportar **Tablas**, Listas y Negritas.
  - El Prompt del Backend (`answerFinancialQuery`) instruye explícitamente el uso de tablas para listar datos.
- **Funcionalidad**:
  - Responde preguntas sobre saldo, gastos por categoría y estado de facturas.
  - Sugerencias rápidas ("¿Cuánto gasté este mes?").
  - Identidad: "CFO Virtual" impulsado por Gemini 2.0.

# 13. Módulo de Aprendizaje Continuo (CFO)
> **Implementado (v1.0)**: Sistema activo que aprende de las interacciones y mejora la relevancia.

- **Persistencia**: Tabla `AIQueryLog` registra cada consulta (filtrado por `unitId`) para análisis de frecuencia.
- **Sugerencias Dinámicas**:
  - Endpoint `/suggestions`: Recupera preguntas sugeridas al inicio.
  - Endpoint `/chat`: Retorna nuevas sugerencias basadas en el historial tras cada mensaje.
  - **Lógica**: Análisis de frecuencia de las últimas 50 consultas de la Unidad.
- **UX**: Sugerencias persistentes (Chips) que no desaparecen, facilitando la navegación continua.

## 13.1 Feedback Explícito (Reglas de Negocio) - ACTUALIZADO v3.0

> [!IMPORTANT]
> **Cambio Arquitectónico Crítico**: La lógica de persistencia de feedback ha sido modificada para evitar colisiones en entornos efímeros y mejorar la escalabilidad del sistema.

### Nueva Arquitectura de Persistencia

**Persistencia Primaria**:
- **Base de Datos**: Tabla `AIFeedback` (UnitId, DocumentType, Comment, SuggestedRule, CreatedAt).
- **Fuente de Verdad**: Todas las reglas de negocio se almacenan exclusivamente en PostgreSQL.

**Eliminación de Escritura Directa en Runtime**:
- ❌ **DEPRECADO**: El backend **NO** debe escribir directamente en `AI_RULES.md` durante runtime.
- **Razón**: Evitar race conditions, conflictos de escritura en entornos containerizados/efímeros (Railway, Vercel), y problemas de sincronización en despliegues multi-instancia.

### Inyección Dinámica de Reglas en Context Window

**Mecanismo de Aplicación**:
1. **Recuperación desde DB**: Al iniciar un escaneo o consulta de IA, el backend consulta `AIFeedback` filtrado por `unitId`.
2. **Construcción de Prompt Dinámico**: Las reglas se inyectan como sección del system prompt:
   ```
   REGLAS DE NEGOCIO PERSONALIZADAS (Aprendidas de Feedback):
   - [Regla 1 del usuario]
   - [Regla 2 del usuario]
   ...
   ```
3. **Context Window**: Las reglas se incluyen en cada llamada a Gemini API como parte del contexto del agente.
4. **Versionado Opcional**: Campo `version` en `AIFeedback` para rastrear evolución de reglas.

**Implementación Técnica**:
```typescript
// Ejemplo en ai.service.ts
async function buildSystemPrompt(unitId: string): Promise<string> {
  const feedbackRules = await prisma.aIFeedback.findMany({
    where: { unitId },
    orderBy: { createdAt: 'desc' },
    take: 50 // Limitar para no exceder token limits
  });

  const customRules = feedbackRules
    .map(f => `- ${f.suggestedRule || f.comment}`)
    .join('\n');

  return `
    ${BASE_SYSTEM_PROMPT}
    
    REGLAS PERSONALIZADAS DE LA UNIDAD:
    ${customRules}
  `;
}
```

### Flujo de Usuario (Sin Cambios en UX)

1. Usuario marca "Regla Incorrecta" o deja comentario en Facturas/Pagos mediante ícono de mensaje.
2. Modal `FeedbackModal` recoge el comentario.
3. Backend guarda el feedback en tabla `AIFeedback`.
4. **NUEVO**: En el siguiente escaneo/consulta, la regla se inyecta automáticamente en el prompt del agente.

### Migración de AI_RULES.md (Opcional)

> [!NOTE]
> Si existen reglas en `AI_RULES.md`, se recomienda:
> 1. Crear script de migración para importar reglas existentes a `AIFeedback`.
> 2. Mantener `AI_RULES.md` como documentación estática (no modificable por backend).
> 3. Actualizar documentación para indicar que las reglas activas viven en DB.

# 14. Estándar de Formularios y Modales (Global Form UX)
> **Implementado**: Estándar de diseño para garantizar que los formularios extensos sean usables y visualmente consistentes.

- **Estructura Obligatoria**:
  - **Header Fijo**: Título y metadata siempre visible. Clase `sticky top-0 z-10 bg-white`. Borde inferior `border-gray-100`.
  - **Cuerpo Scrolleable**: Clase `flex-1 overflow-y-auto p-6`. Uso de `space-y-6`.
  - **Footer Fijo**: Fondo `bg-gray-50`, `sticky bottom-0 z-10`, borde superior `border-t`.
- **Tokens de Diseño**:
  - **Contenedores**: `rounded-card` (12px), `shadow-2xl`.
  - **Campos**: `rounded-input` (8px), `focus:ring-brand-500`.
  - **Visuales**: Backdrop blur en el overlay (`backdrop-blur-sm`).
- **Implementaciones de Referencia**:
  - `InvoiceModal`: Agrupación de retenciones en grids compactas.
  - `PaymentModal`: Sección de totales en alto contraste (`bg-brand-900`, `text-white`).
  - `ProviderModal`: Pestañas de separación (Info vs Documentos) en el header.

# 15. Arquitectura de Despliegue (Producción)
> **Implementado**: Configuración optimizada para el entorno Vercel + Railway.

- **Frontend (Vercel)**:
  - **API Routing**: Uso de `vercel.json` con `rewrites` para dirigir `/api/*` al backend de Railway.
  - **Cron Jobs**: Configurados en `vercel.json` (`crons`) para disparar tareas programadas (GET) hacia el backend.
  - **Variables de Entorno**: `VITE_API_URL` se establece como `/api` (ruta relativa) para eliminar dependencias de URLs fijas en el bundle de cliente y evitar errores de CORS/Mixed Content.
- **Backend (Railway)**:
  - Servidor Express procesando peticiones a través de la red privada o pública según configuración.
  - Sincronización mediante `git push origin main` para despliegue continuo (CI/CD).

# 16. Próximos Pasos Técnicos (Roadmap v3.0)

> [!TIP]
> **Enfoque Estratégico**: Con las funcionalidades core implementadas, el roadmap se centra en **Observabilidad**, **Optimización de Costos** y **Escalabilidad**.

## 16.1. Observabilidad y Monitoreo

### Logging Estructurado
- [ ] **Implementar Winston/Pino**: Reemplazar `console.log` por logging estructurado con niveles (debug, info, warn, error).
- [ ] **Contexto de Request**: Añadir `requestId` a todos los logs para rastreo end-to-end.
- [ ] **Log Aggregation**: Integrar con servicio externo (Logtail, Datadog, Better Stack) para análisis centralizado.

### Tracing de IA
- [ ] **Gemini API Metrics**: Registrar latencia, tokens consumidos, y tasa de error por llamada.
- [ ] **Prompt Versioning**: Rastrear qué versión de prompt generó cada resultado para análisis A/B.
- [ ] **Feedback Loop Metrics**: Dashboard de efectividad de reglas aprendidas (% de correcciones post-feedback).

### Health Checks
- [ ] **Endpoint `/health`**: Verificar conectividad DB, Gmail API, y Gemini API.
- [ ] **Alertas Proactivas**: Notificaciones automáticas si Gmail token expira o cuota de Gemini se agota.

## 16.2. Optimización de Costos de Gemini

### Reducción de Tokens
- [ ] **Prompt Compression**: Analizar prompts actuales y eliminar redundancias (objetivo: -20% tokens).
- [ ] **Caching de Contexto**: Implementar `cachedContent` de Gemini para reutilizar contexto de unidad entre llamadas.
- [ ] **Lazy Loading de Reglas**: Cargar solo reglas relevantes al tipo de documento (Invoice vs Payment).

### Estrategia de Modelos
- [ ] **Tier Selection**: Usar Gemini Flash para tareas simples (extracción), Gemini Pro solo para análisis complejos.
- [ ] **Batch Processing**: Agrupar múltiples correos en una sola llamada cuando sea posible.

### Monitoreo de Cuota
- [ ] **Dashboard de Costos**: Visualización de gasto diario/mensual por unidad.
- [ ] **Rate Limiting**: Implementar límites configurables de escaneos por unidad/día.
- [ ] **Budget Alerts**: Notificaciones cuando se alcance 80% del presupuesto mensual.

## 16.3. Escalabilidad y Performance

### Database Optimization
- [ ] **Índices Compuestos**: Analizar queries lentas y añadir índices (ej: `unitId + createdAt`).
- [ ] **Connection Pooling**: Optimizar configuración de Prisma para alta concurrencia.
- [ ] **Read Replicas**: Evaluar separación de lecturas/escrituras para queries de reporting.

### Async Job Queue
- [ ] **Implementar BullMQ**: Migrar escaneos a sistema de colas robusto (Sección 10.1).
- [ ] **Retry Logic**: Reintentos automáticos con backoff exponencial para fallos transitorios.
- [ ] **Priority Queues**: Escaneos manuales con mayor prioridad que automáticos.

### Edge Functions (Preparación)
- [ ] **Validar Driver Adapters**: Probar `previewFeatures = ["driverAdapters"]` en entorno staging.
- [ ] **Identificar Candidatos**: Endpoints de solo lectura que se beneficien de edge deployment.

## 16.4. Seguridad y Compliance

### Audit Trail
- [ ] **Tabla de Auditoría**: Registrar todas las modificaciones críticas (facturas, pagos, proveedores).
- [ ] **User Actions Log**: Rastrear quién modificó qué y cuándo.

### Data Retention
- [ ] **Política de Retención**: Definir tiempo de vida de logs, escaneos fallidos, y feedback antiguo.
- [ ] **GDPR Compliance**: Implementar endpoint de "derecho al olvido" si aplica.

---

# Registro de Cambios (Changelog)

## [3.0.0] - 2026-01-19

### 🔄 Cambios Arquitectónicos Críticos

#### Sección 2 - Persistencia
- **AÑADIDO**: Restricción técnica para Prisma `previewFeatures = ["driverAdapters"]` para optimización de latencia en Edge Functions futuras.
- **Justificación**: Preparar infraestructura para despliegues serverless de baja latencia.

#### Sección 10.1 - Arquitectura de Cron (REFACTORIZACIÓN MAYOR)
- **MODIFICADO**: Endpoint `/api/scan/cron/scan-all` redefinido como **asíncrono**.
- **AÑADIDO**: Retorno inmediato con HTTP `202 Accepted` + Job ID.
- **AÑADIDO**: Especificación de sistema de monitoreo de jobs:
  - Opción A: Webhook para notificaciones de finalización.
  - Opción B: Endpoint `GET /api/scan/jobs/:jobId` para consulta de estado.
- **AÑADIDO**: Estructura de respuesta JSON para job status (progreso, resultados, errores).
- **AÑADIDO**: Requisito de nueva tabla `ScanJobs` en Prisma schema.
- **AÑADIDO**: Recomendación de implementación con BullMQ o Worker Threads.
- **Justificación**: Evitar timeouts en Railway (límite 30s) para escaneos largos de múltiples unidades.

#### Sección 13.1 - Feedback de IA (REFACTORIZACIÓN MAYOR)
- **ELIMINADO**: Instrucción de escritura directa en `AI_RULES.md` durante runtime.
- **MODIFICADO**: Persistencia primaria exclusivamente en tabla `AIFeedback` (PostgreSQL).
- **AÑADIDO**: Mecanismo de inyección dinámica de reglas en context window de Gemini.
- **AÑADIDO**: Ejemplo de código para construcción de system prompt con reglas desde DB.
- **AÑADIDO**: Recomendación de script de migración para reglas existentes en `AI_RULES.md`.
- **AÑADIDO**: Campo opcional `version` en `AIFeedback` para versionado de reglas.
- **Justificación**: Evitar race conditions y conflictos en entornos containerizados/multi-instancia.

### 📋 Nuevas Secciones

#### Sección 16 - Próximos Pasos Técnicos (REESCRITURA COMPLETA)
- **ELIMINADO**: Roadmap de funcionalidades core (todas implementadas).
- **AÑADIDO**: Enfoque en Observabilidad, Optimización de Costos y Escalabilidad.
- **AÑADIDO**: Subsección 16.1 - Observabilidad y Monitoreo:
  - Logging estructurado con Winston/Pino.
  - Tracing de métricas de Gemini API (latencia, tokens, errores).
  - Health checks y alertas proactivas.
- **AÑADIDO**: Subsección 16.2 - Optimización de Costos de Gemini:
  - Prompt compression (objetivo: -20% tokens).
  - Caching de contexto con `cachedContent`.
  - Estrategia de tier selection (Flash vs Pro).
  - Dashboard de costos y budget alerts.
- **AÑADIDO**: Subsección 16.3 - Escalabilidad y Performance:
  - Optimización de índices DB y connection pooling.
  - Migración a BullMQ para async jobs.
  - Preparación para Edge Functions.
- **AÑADIDO**: Subsección 16.4 - Seguridad y Compliance:
  - Audit trail y user actions log.
  - Política de retención de datos y GDPR compliance.

### 📝 Mejoras de Documentación

- **AÑADIDO**: Alertas GitHub-style (`[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`, `[!NOTE]`, `[!TIP]`) para destacar información crítica.
- **MEJORADO**: Formato de código con ejemplos TypeScript para mayor claridad.
- **MEJORADO**: Tablas de especificación de respuestas JSON para endpoints asíncronos.

### 🔍 Validación de Consistencia

- **VERIFICADO**: No se detectaron contradicciones con el "Theme Maestro" (Sección 5).
- **VERIFICADO**: Todas las secciones mantienen coherencia con el stack tecnológico definido (Sección 1).
- **VERIFICADO**: Cambios alineados con principios BMAD (Backend-First, Modular, Atomic, Data-Driven).

---

## Notas de Migración v2.0 → v3.0

### Acciones Requeridas para Implementación

1. **Prisma Schema**: ✅ **COMPLETADO (2026-01-19)**
   - ~~Añadir `previewFeatures = ["driverAdapters"]`~~ - Ya no necesario (estable en Prisma 6.19.1+)
   - ✅ Tabla `ScanningJob` implementada con todos los campos requeridos.
   - ✅ Añadido campo `version` a tabla `AIFeedback` (migración SQL ejecutada).

2. **Backend (apps/api)**: ✅ **COMPLETADO (2026-01-19)**
   - ✅ Sistema de jobs asíncrono implementado (`runBackgroundScan` en `scan.ts`).
   - ✅ Endpoint `GET /api/scan/scan-status/:jobId` implementado.
   - ✅ Endpoint `POST /api/scan/cron/scan-all` crea jobs en background.
   - ✅ Modificado `ai.service.ts` para inyectar reglas desde `AIFeedback` (usa `AIRulesService.buildDynamicRulesFromDB`).
   - ✅ Eliminada lógica de escritura en `AI_RULES.md` (ahora solo lectura desde DB).
   - ✅ **AÑADIDO**: Logging estructurado con Winston (Fase 2.1).
   - 🟡 **PD**: Pendiente renombrar `ScanningJob` a `ScanJob` para consistencia total.

3. **Cron Service (apps/cron)**: ✅ **COMPLETADO (2026-01-19)**
   - ✅ Servicio implementado en `apps/cron/index.js`.
   - ✅ Llama a `/api/scan/cron/scan-all` con autenticación.
   - ✅ Loggea respuestas completas.
   - 🟡 **Opcional**: Actualizar para aceptar código `202` si se implementa.

4. **Migración de Datos**: ✅ **COMPLETADO (2026-01-19)**
   - ✅ Ejecutado script `migrate-ai-rules.ts`: 3 reglas importadas a 4 unidades (12 entradas totales).
   - ✅ Validado que reglas se inyectan correctamente en prompts desde DB.

5. **Observabilidad**: ✅ **COMPLETADO (2026-01-19)**
   - ✅ Integrar logging estructurado (Winston - Fase 2.1).
   - ✅ Implementar métricas de Gemini API (Fase 2.2 - Latencia, Tokens, Status).
   - 🟡 **Opcional**: Configurar servicio de log aggregation (Logtail, Better Stack).

### Breaking Changes

- ⚠️ **API Contract Change**: `/api/scan/cron/scan-all` ahora retorna `202` en vez de `200`. Clientes deben adaptarse.
- ⚠️ **Behavioral Change**: Reglas de feedback ya no se escriben en `AI_RULES.md`. Cualquier proceso que lea ese archivo debe migrar a DB.

### Compatibilidad Retroactiva

- ✅ **Frontend**: Sin cambios requeridos en UI (UX se mantiene idéntica).
- ✅ **Database**: Nuevas tablas/campos son aditivos, no requieren modificación de datos existentes.
- ✅ **Environment Variables**: Variables existentes se mantienen, solo se añaden opcionales.

---

## [3.1.0] - 2026-01-19

### 🎨 UI/UX & Visualización
- **AÑADIDO**: Estándar de previsualización de archivos PDF/Imágenes unificado entre Facturas y Egresos.
- **AÑADIDO**: Mejora de Modales con Headers y Footers `sticky` para formularios extensos.
- **CORREGIDO**: Bug de visualización de imágenes forzadas a PDF en `InvoicesPage`.
- **CORREGIDO**: Iconografía en Egresos para alinearse con Facturas (Uso de `FileText` para soportes).

### 🛠️ Backend & Cron
- **MODIFICADO**: Endpoint `/api/scan/cron/scan-all` ahora retorna formalmente `202 Accepted`.
- **LIMPIEZA**: Eliminación de dependencias de iconos no utilizados en frontend.
- **OPT**: Refactor de lógica de apertura de Blobs para manejar errores core de Cloudinary RAW.

---

## [3.2.0] - 2026-01-19

### 🤖 IA & Extracción de Datos
- **AÑADIDO**: Estándar de extracción de fechas para Colombia (DD/MM/YYYY).
- **MODIFICADO**: Prompt de Gemini enriquecido con contexto regional para evitar confusión MM/DD.
- **AÑADIDO**: Función `parseRobusDate` en el backend para normalización de fechas ambiguas.
- **CORREGIDO**: Error de interpretación de facturas de inicio de año (Enero vs Febrero).

---

## [3.3.0] - 2026-01-19

### 📊 Reporting & Cierre
- **AÑADIDO**: Estándares para Cierre Mensual: Lógica de habilitación de botones y modales sticky.
- **UNIFICADO**: Función `openFileUrl` avanzada en `MonthlyClosurePage`.
- **UI/UX**: Alineación de `ValidationModal` y `ReportDetailsModal` con Spec V3.

---

## [3.3.1] - 2026-01-19

### 📑 Documentación y Reglas
- **AÑADIDO**: Detalle de condiciones técnicas y lógicas para el Cierre Mensual.
- **REFORZADO**: Validación de vínculo obligatorio de facturas para permitir el cierre.
---

## [3.4.0] - 2026-01-19

### 🔍 Observabilidad avanzada (IA Tracing)
- **AÑADIDO**: Modelo `GeminiMetric` para persistir latencia, tokens y status de cada llamada.
- **AÑADIDO**: `TelemetryService` para logging asíncrono de métricas.
- **MODIFICADO**: `ai.service.ts` con helper `logMetric` y manejo de errores (try-catch) en todas las funciones.
- **VERIFICADO**: Registro exitoso de errores 400 (Bad Request) y latencia en DB.

# 17. Optimización Móvil y Validaciones (UX Avanzada)
> **Implementado**: Mejoras significativas en la experiencia de carga de archivos y seguridad operativa.

## 17.1. Carga Inteligente de Archivos (Smart Uploads)
Para resolver la lentitud en cargas desde móviles (fotos de 5MB+ en 4G), se implementó una estrategia de compresión en el cliente.

- **Tecnología**: `browser-image-compression`.
- **Componente**: `SmartFileUploader.tsx`.
- **Lógica**:
  - Intercepta la selección del archivo.
  - Si es imagen, la comprime (Max 1MB o 1920x1080).
  - Muestra progreso circular real.
  - Sube el archivo optimizado a la API.
- **Resultado**: Reducción de ~90% en tiempos de espera (ej: 5MB -> 300KB).

## 17.2. Validación de Destinatario (Seguridad)
Para prevenir errores contables donde se suben facturas de otros conjuntos.

- **Componente**: `InvoicesPage.tsx`.
- **Flujo**:
  1. IA extrae `clientNit` del documento.
  2. Frontend compara con `unit.taxId` (NIT del Conjunto).
  3. Si hay mismatch, muestra una **Alerta Amarilla**: *"⚠️ Posible error de destinatario"*.
- **UX**: Es una advertencia no bloqueante. El usuario tiene la decisión final.

## 17.3. Responsividad Móvil (Grids)
- **Estándar**: Formularios usan `grid-cols-1 md:grid-cols-2`.
- **Comportamiento**:
  - **Desktop**: Campos lado a lado.
  - **Móvil**: Campos apilados verticalmente para facilitar la escritura táctil.

---

## [3.5.0] - 2026-01-19

### 📱 Mobile First & Performance
- **AÑADIDO**: Componente `SmartFileUploader` con compresión de imágenes client-side.
- **OPTIMIZADO**: Modales de Facturas y Egresos con layouts responsivos (`grid-cols-1` en móvil).
- **AÑADIDO**: Feedback visual de progreso de carga (Spinners y % de subida).

### 🛡️ Seguridad Operativa
- **AÑADIDO**: Validación automática de NIT Receptor vs NIT Conjunto en Facturas.
- **UX**: Implementación de advertencias no intrusivas ("Yellow Alerts") para discrepancias de datos.

### 🐛 Bug Fixes
- **CORREGIDO**: Enlace incorrecto en botón "Generar Cierre Mensual" (apuntaba a /reports, ahora /closure).
- **CORREGIDO**: Sincronización de UI "Scan: Nunca" -> Ahora se actualiza automáticamente al finalizar un escaneo sin recargar página.


## [3.5.1] - 2026-01-19

### 🐛 Mobile Corrections & AI Stability
- **CORREGIDO**: Error "Error connecting to AI service" en móviles. 
  - *Causa*: El frontend no enviaba `unitId` a los endpoints de análisis (`/analyze`).
  - *Solución*: Se actualizó `analyzeDocument` (gmail.ts) y las llamadas en `InvoicesPage` / `PaymentsPage` para inyectar contexto de unidad.
- **INFRAESTRUCTURA**: Configuración nativa de **Vercel Cron Jobs** para escaneos de facturas.
  - *Detalle*: Se añadió `vercel.json` con triggers diarios (`0 10 * * *` = 5:00 AM COL) por límites de plan Hobby.
  - *Backend*: Se habilitó método `GET` en `/api/scan/cron/scan-all` para compatibilidad con Vercel.
- **UX/UI**: Corrección de alcance visual en barra de progreso de escaneos.
  - *Detalle*: La barra de estado de escaneo ahora solo es visible dentro de la unidad que inició el proceso.

---

## [3.5.2] - 2026-01-19

### 🐛 Bug Fixes
- **CORREGIDO**: Regresión en creación de Egresos que impedía asociar facturas.
  - *Causa*: Desalineación de parámetros en payload (`invoices` vs `invoiceAllocations`).

## [3.5.7] - 2026-01-19

### 🔧 Infraestructura & Debugging
- **AÑADIDO**: Mejor soporte para CORS.
  - Se agregó la variable de entorno `FRONTEND_URL` al backend para permitir orígenes dinámicos sin modificar código.
  - Se implementó logging detallado de errores de CORS para identificar exactamente qué origen está siendo rechazado en producción.
- **FIJO**: Error "Not allowed by CORS" mediante visibilidad mejorada en logs de Railway.

## [3.5.6] - 2026-01-19

### 🔄 Refinamiento de Flujo (Business Logic)
- **MODIFICADO**: Restricción de facturas en Egresos.
  - Se removió el estado `DRAFT` de la lista de facturas asociables a pagos.
  - *Razón*: Mantener la integridad del proceso de aprobación; una factura debe revisarse y pasar a `PENDING` antes de ser pagada.
- **MANTENIDO**: Inclusión de facturas `OVERDUE` (vencidas) en los procesos de asociación de pagos.

## [3.5.5] - 2026-01-19

### 🐛 Bug Fixes & Logic Correction
- **CORREGIDO**: Visibilidad de facturas en Egresos.
  - *Problema*: Facturas en estado `DRAFT` (escaneadas) y `OVERDUE` (vencidas) no aparecían para asociar.
  - *Solución*: Se actualizó el filtro en `PaymentModal` y `LinkInvoiceModal` para incluir todos los estados pagables (`DRAFT`, `PENDING`, `PARTIALLY_PAID`, `OVERDUE`).
- **MEJORA**: Flujo de pago directo desde escaneo (Gmail -> Draft -> Payment).

## [3.5.4] - 2026-01-19

### 💄 User Interface
- **MEJORA**: Claridad en estado de Egresos.
  - *Problema*: Egresos con soporte pero sin factura aparecían como "Completo", confundiendo al usuario.
  - *Solución*: Si un pago tiene `hasPendingInvoice: true`, ahora muestra explicitamente el estado `Falta Factura` en color naranja, independientemente de su estado interno.

## [3.5.3] - 2026-01-19

### 🐛 Bug Fixes
- **CORREGIDO**: Lógica de aprobación de Egresos (Borradores).
  - *Problema*: Al aprobar un borrador, se marcaba siempre como "Sin Soporte" incluso si ya tenía archivo adjunto.
  - *Solución*: Se implementó validación condicional en `handleApprovePayment` para asignar estado `COMPLETED` si existe soporte, o `PAID_NO_SUPPORT` si no.

