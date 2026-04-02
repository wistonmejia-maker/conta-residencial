# Documento de Especificación Técnica (SDD) - v4.8.0
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
  - `unit.schema.ts`: Valida configuración de unidades (Semillas, NIT, Correos).
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

# 9. Lógica de Numeración y Auditoría (v4.3)
> **Establecido**: Reglas para la asignación de números de Comprobante de Egreso (CE).

### 9.1. Numeración Diferida
Para garantizar una secuencia auditiva impecable y evitar "huecos" en la contabilidad, la asignación del `consecutiveNumber` (CE) sigue estas reglas:
1.  **Borradores (DRAFT)**: Los pagos en estado borrador **NO** reciben número de CE.
2.  **Falta Factura (`hasPendingInvoice`)**: Los pagos sin factura asociada **Pospone** la numeración hasta que se vincule el documento soporte.
3.  **Pagos Externos**: Solo reciben número manual si el usuario lo especifica; de lo contrario, se consideran informativos y no consumen la semilla (seed) de la unidad.
4.  **Asignación Definitiva**: El número se asigna automáticamente al momento de:
    - Cargar el Soporte de Pago (PDF).
    - Vincular una Factura a un pago previamente pendiente.
    - Cambiar el estado a `COMPLETED` manualmente.

### 9.2. Ordenamiento en Reportes y Cierres
- Los egresos se presentan siempre en orden **ASCENDENTE** por su número de CE.
- Los registros sin número (nulos) se desplazan al **final** de las listas para no romper la secuencia cronológica de los documentos oficiales.

# 10. Dashboard y Analítica Proactiva (v4.5)
> **Implementado**: Centro de control financiero con visualización avanzada y alertas de calidad.

### 10.1. Balance de Flujo Mensual (Cash vs Accrual)
Gráfico compuesto (`ComposedChart`) que compara:
- **Pagado (Egresos)**: Flujo de caja real del periodo.
- **Facturado (Pasivos)**: Compromisos adquiridos en el periodo.
- **Línea de Balance**: Diferencia neta. Una línea positiva indica saneamiento de deuda anterior; una negativa indica acumulación de pasivos.

### 10.2. Distribución Contable
- **Categorías**: Los egresos se agrupan por la categoría definida en el perfil del **Proveedor**.
- **Visualización**: Gráfico de donut con el Top 5 de categorías de gasto para identificar fugas de presupuesto.

### 10.3. Panel de Control de Calidad
Monitoreo en tiempo real de infracciones contables:
- **Soportes Faltantes**: Pagos ejecutados sin archivo PDF adjunto.
- **Facturas Vencidas**: Documentos pendientes de pago cuya fecha de vencimiento ha pasado.
- **Ítems en Borrador**: Documentos importados por IA que requieren validación humana.

# 11. Configuración de Etiquetado Gmail (Implementado)
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

### Arquitectura de Servicio (`apps/cron`) - ✅ Implementado

- ✅ **Microservicio Independiente**: `apps/cron/index.js` implementado.
- ✅ **Endpoint Objetivo**: Llama a `POST /api/scan/cron/scan-all`.
- ✅ **Variables de Entorno**:
  - `API_URL`: URL pública de producción Railway.
  - `CRON_SECRET`: Token de autenticación.

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

# 11. Motor de Inferencia Fiscal (IA Híbrida)
> **Implementado**: Sistema inteligente para la sugerencia de retenciones fiscales en facturas.

- **Objetivo**: Reducir la carga operativa sugiriendo valores contables (Retefuente, ReteICA) basados en el análisis del documento y normas nacionales.
- **Componentes**:
  - `ai.service.ts`: Prompt enriquecido con normas Colombia 2025 (UVT $49.799, Bases Servicios/Compras).
  - `InvoicesPage.tsx`: Lógica de prioridad en UI.

## 11.1. Lógica de Retenciones (Nueva Arquitectura v3.5.9)

> **Cambio Breaking**: Los campos `defaultRetefuentePerc` y `defaultReteicaPerc` en Proveedores están **deprecados** (soft deprecation). Las retenciones ahora se definen **únicamente en la Factura**.

### Fuentes de Retenciones (Orden de Prioridad)

1. **Extracción IA del Documento**:
   - Si el documento (factura electrónica) tiene retenciones impresas, se extraen automáticamente.
   
2. **Sugerencia IA según Normas Colombia**:
   - Si el documento no tiene retenciones visibles, la IA sugiere valores según UVT 2025 y bases aplicables.

3. **Entrada Manual**:
   - El usuario/contador puede editar los valores finales en cualquier momento.

### Flujo de Retenciones

```
FACTURA: Define retenciones (IA extrae o usuario ingresa)
    ↓
EGRESO: Hereda retenciones de las facturas seleccionadas (suma)
    ↓
Usuario puede ajustar manualmente si es necesario
```

## 11.2. Estándar de Extracción de Fechas (Patrón Colombiano)
> **Implementado**: Lógica robusta para evitar la confusión entre Mes y Día en documentos locales.

Para garantizar la precisión en facturas colombianas (donde `02/01/2026` es 2 de Enero y no 1 de Febrero), se ha establecido el siguiente estándar:

- **Prompting**: El system prompt instruye explícitamente a la IA sobre el formato `DD/MM/YYYY` predominante en Colombia.
- **Backend (Robustness)**: Implementación de `parseRobusDate` que prioriza el patrón `DD/MM/YYYY` si el parseo ISO falla o es ambiguo.

---

### 11.4. Estándar de Cierre Mensual (Reporting)
- **Botones de Reporte**: Deben estar habilitados si existe al menos **un egreso** pagado O **una factura** pendiente en el periodo.
- **Modales de Reporte**: Deben seguir el layout de Modales `spec_v3` (encabezados y pies fijos, backdrop-blur-sm, shadow-2xl).

#### Condiciones Obligatorias para el Cierre:
1.  **Existencia de Movimientos**: Al menos un pago o factura pendiente sin reportar en el rango de fechas.
2.  **Vínculo Documental**: Si un pago indica "Tiene factura", el cierre se bloquea hasta que la factura esté vinculada.
3.  **Garantía de Soportes**: Los egresos incluidos deben tener Soporte de Pago (Recibo bancario) y las facturas su PDF/Imagen original para la Carpeta Contable.
4.  **Confirmación de Usuario**: Resumen explícito del conteo de documentos antes de la ejecución definitiva.

#### 11.4.1. Orden de Presentación (v4.0)
- **Orden de Egresos**: En la tabla de "Detalle de Novedades" y en el Excel, los egresos **DEBEN** estar ordenados por número de CE de forma **ASCENDENTE**.
- **Manejo de Pendientes**: Los pagos que no tienen número de CE (Borradores, Falta Factura, Externos) se agrupan automáticamente al final de la lista, ordenados por fecha.

# 12. Asistente Financiero (CFO Virtual)
> **Implementado**: Interfaz de chat flotante para consultas en lenguaje natural sobre el estado financiero.

- **Componente UI**: `AIChatWidget.tsx` (Botón flotante en esquina inferior derecha).
- **Estilos**: Requiere clases `.ai-gradient` y `.ai-pulse` en `index.css`.

# 13. Módulo de Aprendizaje Continuo (CFO)
> **Implementado (v1.0)**: Sistema activo que aprende de las interacciones y mejora la relevancia.

- **Persistencia**: Tabla `AIQueryLog` registra cada consulta (filtrado por `unitId`) para análisis de frecuencia.
- **Sugerencias Dinámicas**:
  - Endpoint `/suggestions`: Recupera preguntas sugeridas al inicio.
  - Endpoint `/chat`: Retorna nuevas sugerencias basadas en el historial tras cada mensaje.

## 13.1 Feedback Explícito (Reglas de Negocio) - ACTUALIZADO v3.0

> [!IMPORTANT]
> **Cambio Arquitectónico Crítico**: La lógica de persistencia de feedback ha sido modificada para evitar colisiones en entornos efímeros y mejorar la escalabilidad del sistema.

### Nueva Arquitectura de Persistencia

**Persistencia Primaria**:
- **Base de Datos**: Tabla `AIFeedback` (UnitId, DocumentType, Comment, SuggestedRule, CreatedAt).
- **Fuente de Verdad**: Todas las reglas de negocio se almacenan exclusivamente en PostgreSQL.

# 14. Estándar de Formularios y Modales (Global Form UX)
> **Implementado**: Estándar de diseño para garantizar que los formularios extensos sean usables y visualmente consistentes.

- **Estructura Obligatoria**:
  - **Header Fijo**: Título y metadata siempre visible. Clase `sticky top-0 z-10 bg-white`.
  - **Cuerpo Scrolleable**: Clase `flex-1 overflow-y-auto p-6`.
  - **Footer Fijo**: Fondo `bg-gray-50`, `sticky bottom-0 z-10`.

# 15. Arquitectura de Despliegue (Producción)
> **Implementado**: Configuración optimizada para el entorno Vercel + Railway.

- **Frontend (Vercel)**:
  - **API Routing**: Uso de `vercel.json` con `rewrites` para dirigir `/api/*` al backend de Railway.
- **Backend (Railway)**: Servidor Express procesando peticiones.

# 20. Conciliación Manual "Ghost Match" (v3.8.0)
> **Implementado**: Sistema para conciliar egresos sin necesidad de importar el extracto bancario.

# 21. Optimización de Filtros y Cierre (Reporting)
> **Implementado**: Mejoras en la precisión del reporte mensual y usabilidad de filtros.

# 22. Estándar de Filtros Horizontales (v4.0)
Para optimizar el espacio vertical y garantizar la consistencia visual, todas las páginas principales deben usar el componente `FilterBar` horizontal.

# 23. Lógica de Notas Crédito (Saneamiento v4.6)
> **Establecido**: Reglas de negocio para el manejo de Notas Crédito (NC).

- **Saldo Forzado a Cero**: Todo documento marcado como `NOTA_CREDITO` tiene automáticamente un `balance = 0`.
- **Exclusión en Cierre Mensual**: Los NCs se excluyen automáticamente de la lista de pendientes del cierre.

# 24. Reversa de Conciliación y UI Dinámica (v4.7)
> **Implementado**: Capacidad de deshacer conciliaciones para corregir errores de cruce.

### 24.1. Acción de Reversa (Backend)
- **Endpoint**: `DELETE /api/bank/conciliate/:id`

### 24.2. UI de Acción Unificada (Toggled Slot)
Botón dinámico que alterna entre "Conciliar" y "Reversar" según el estado del pago.

# 25. Estándar de Carga Directa a la Nube (v4.8)
Para archivos de gran tamaño (especialmente cierres mensuales), se debe evitar el uso del backend como túnel para no chocar con los límites de payload de Vercel (4.5 MB).

- **Arquitectura**: 
    1. El frontend solicita una **Firma de Seguridad** al endpoint `GET /api/files/signature`.
    2. El frontend realiza un `POST` multipart directamente a las APIs de Cloudinary.
    3. El backend nunca recibe el cuerpo del archivo, eliminando el riesgo de Error 500 por tamaño.

# 26. Estándar de Modales de Confirmación (UX Propio)
Se proscribe el uso de `window.confirm()` y `window.alert()` para acciones críticas de negocio.

- **Requisito**: Implementar modales React integrados que permitan mostrar resúmenes de datos ricos antes de proceder.

---

## [4.8.0] - 2026-04-02 (Sesión Actual)

### 🚀 Arquitectura de Carga (v4.8)
- **AÑADIDO**: Sistema de **Carga Directa a la Nube** (Bypass de Vercel) para archivos pesados.
- **API**: Nuevo endpoint `/api/files/signature` para firmas seguras de Cloudinary.
- **FIX**: Resolución del Error 500 al cerrar meses con gran volumen de documentos.

### ✨ Modales de Confirmación (v4.7)
- **REFACTOR**: Eliminación de `confirm()` nativo en el Cierre Mensual.
- **UI/UX**: Nuevo modal de confirmación con resumen de pagos y facturas integrado.

---

## [4.7.0] - 2026-04-01

### ✨ Reversa de Conciliación (v4.7)
- **AÑADIDO**: Botón de **Reversar Conciliación** (`RotateCcw`) integrado en el mismo slot del botón de conciliar (toggle).

---

## [4.0.0] - 2026-03-27

### ✨ Estandarización Contable (v4.0)
- **REFACTOR**: Numeración de CE diferida hasta aprobación definitiva.
- **REPORTES**: Ordenamiento ascendente por CE en Cierre Mensual y exportaciones.
- **GLOBAL**: Cambio de branding a **"ContaResidencial"** y formato `DD/MM/YYYY`.

---
