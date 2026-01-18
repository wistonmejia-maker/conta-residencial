Documento de Especificación Técnica (SDD) - v2.0
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

# 6. Objetivos Cumplidos (Refactor Q1 2026)
- [x] **Unificación de DB**: Renombrado a modelos PascalCase.
- [x] **Abstracción de IA**: Sistema de prompts dinámicos implementado.
- [x] **Validación**: Zod integrado en rutas críticas.
- [x] **Lógica Fiscal**: Servicio contable desacoplado.
- [x] **Limpieza de UI/UX**: Theme Maestro aplicado en toda la plataforma refactorizada.
- [x] **Gmail Center**: Escaneo de inbox centralizado en Dashboard.

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
  - `gmailLastAutoScan`: Timestamp del último escaneo automático

| Campo | Propósito |
|:------|:----------|
| Días relativos | Escanea "últimos X días" en vez de fecha fija |
| Auto-scan | Ejecuta escaneo cada hora automáticamente |

- **Backend** (`scan.ts`):
  - Endpoint cron: `POST /api/scan/cron/scan-all`
  - Protegido por `CRON_SECRET` header
  - Filtra units con `gmailAutoScanEnabled = true` y Gmail conectado
  - Excluye correos ya etiquetados: `-label:Procesado`
- **Servicio de Disparo** (`apps/cron`):
  - Script ligero en Node.js que llama al endpoint cada hora.
  - Diseñado para ejecutarse como un "Cron Job" en Railway.
  - Requiere variables `API_URL` y `CRON_SECRET`.
- **Prioridad de filtro**: Días relativos > Fecha fija > Default 1 día