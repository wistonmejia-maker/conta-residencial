Documento de Especificación Técnica (SDD) - Conta Residencial / Copropiedad SaaS
1. Stack Tecnológico
La aplicación sigue una arquitectura Monorepo (gestionada posiblemente con Turbo o espacios de trabajo básicos) separando claramente Frontend (apps/web) y Backend (apps/api).

Frontend (apps/web)
Framework: Recat v18.2.0 + Vite v5.1.4.
Lenguaje: TypeScript v5.3.3.
Estilos: Tailwind CSS v3.4.1 (con clsx y tailwind-merge para gestión de clases).
Estado y Data Fetching: @tanstack/react-query v5.24.1.
Routing: React Router DOM v6.22.2.
Manejo de Archivos:
jspdf, jspdf-autotable, pdf-lib (Generación y manipulación de PDFs).
xlsx (Manejo de Excel).
Backend as a Service (Auth/DB parcial): Firebase v10.8.1 (Auth SDK presente).
UI Icons: Lucide React v0.344.0.
Backend (apps/api)
Runtime: Node.js (Express v5.2.1).
Lenguaje: TypeScript v5.9.3 (vía ts-node-dev en desarrollo).
Base de Datos: PostgreSQL.
ORM: Prisma v6.19.1 (@prisma/client).
Validación de Datos: Zod v4.3.5.
IA Generativa: Google Generative AI (@google/generative-ai v0.24.1) - Integración con Gemini Flash 2.0.
Integraciones Externas:
googleapis (Gmail API).
cloudinary (Almacenamiento de imágenes).
Utilidades: multer (Uploads), adm-zip, fast-xml-parser.
Infraestructura (Inferred)
Deployment: Vercel (Frontend), Railway (Backend - inferido por logs de curl en terminal).
2. Modelos de Datos
El modelo de datos relacional está definido en Prisma.

Entidades Core
Unit: Representa un conjunto residencial o propiedad.
Relaciones: Tiene múltiples Invoices, Payments, 
BankMovements
.
Configuración: taxId, propertyType, roles de acceso.
Provider: Terceros que prestan servicios (Contratistas, Servicios Públicos).
Atributos: nit, taxType, isRecurring.
Invoice: Facturas o Cuentas de Cobro por pagar.
Estados: PENDING, PARTIALLY_PAID, PAID, DRAFT.
Clave: Relación única [providerId, invoiceNumber].
Payment: Comprobantes de Egreso (Salidas de dinero).
Lógica: Puede cruzar con múltiples facturas (PaymentInvoice).
BankMovement
: Transacción bancaria cruda importada del extracto.
Estado: isConciliated (Booleano).
Entidades de Soporte
Conciliation: Tabla pivote que une un Payment (App) con un 
BankMovement
 (Banco).
GmailToken: Almacena tokens OAuth de Google para escanear correos de facturas por Unit.
ScanningJob: Cola de procesamiento asíncrono para lectura masiva de documentos.
AIFeedback: Sistema de "Human-in-the-loop" para que el usuario corrija o valide inferencias de la IA.
Usuarios y Organización (Sistema Multi-Tenant)
organizations y users: Manejan la cuenta maestra y usuarios globales.
user_unit_access: Tabla de relación N:N que define roles (ADMIN, ACCOUNTANT, VIEWER) de un usuario sobre una Unit.
3. Reglas de Negocio Detectadas
3.1. Procesamiento Inteligente de Documentos (IA)
El sistema utiliza Google Gemini Flash 2.0 para:

Clasificación: Distingue entre INVOICE, PAYMENT_RECEIPT y OTHER.
Extracción: Lee NITs, fechas, montos y conceptos de PDFs/Imágenes.
Conciliación Automática: Un agente de IA compara listas de movimientos bancarios vs pagos pendientes usando lógica difusa (fechas cercanas, montos similares, similitud semántica en descripción).
3.2. Gestión de Facturación
Validación de Duplicados: No permite ingresar dos facturas con el mismo número para el mismo proveedor (409 Conflict).
Consecutivos Automáticos: Genera "Cuentas de Cobro" (Documento Soporte) con prefijo CC-YYYY-MM-XXX si el proveedor no emite factura formal.
Cálculo de Impuestos: Soporta Retefuente y ReteICA calculados sobre el subtotal.
3.3. Integración Gmail
El sistema se conecta a la cuenta de Gmail del conjunto (vía OAuth almacenado en GmailToken).
Escanea correos buscando adjuntos (PDF/XML).
Utiliza la IA para extraer datos automáticamente e insertarlos como borradores de facturas.
3.4. Auditoría y Alertas
Bank Match: Cruza egresos con extractos.
Monthly Insights: Genera un reporte en texto natural analizando variaciones de gastos vs. promedio histórico (detecta anomalías >20%).
4. Endpoints y Conexiones
API Estructura (REST)
Organizada por recursos en apps/api/src/routes/:

/invoices:
GET /: Listado con filtros (unitId, providerId, status).
POST /: Creación con validación de unicidad.
GET /stats/summary: Agregaciones (Sumas y Conteos) por estado.
GET /next-cc-number: Generador de consecutivos.
/scans: Endpoints para iniciar trabajos de escaneo OCR.
/auth: Manejo de sesión y tokens.
/bank: Importación de extractos y conciliación.
Integraciones Externas
Google Generative AI: Motor de inteligencia para OCR y análisis financiero.
Gmail API: Fuente de entrada de documentos.
Cloudinary: CDN para alojar PDFs e imágenes de facturas.
Postgres (Prisma): Persistencia principal.
5. Guía de Estilo Visual (Design System de Facto)
Base: Tailwind CSS Standard
No se detectó una configuración de tema personalizada (theme.extend vacío en 
tailwind.config.js
). El sistema utiliza la paleta de colores por defecto de Tailwind.

Componentes UI Inferidos
Iconografía: lucide-react para iconos consistentes (lineales, limpios).
Layouts: Uso de max-w-7xl mx-auto para contenedores principales.
Colores Semánticos (Patrón común en código):
Estados: Probablemente usa green-500 (Paid), yellow-500 (Pending), red-500 (Overdue).
Superficies: bg-white para tarjetas, bg-gray-50 para fondos de aplicación.
6. Deuda Técnica y Observaciones
WARNING

Inconsistencia en Naming Conventions (Base de Datos) Existe una mezcla de estilos en los modelos de Prisma:

UpperCamelCase para entidades de negocio: Unit, Invoice, Provider.
snake_case para entidades de sistema/usuario: organizations, users, user_unit_access. Recomendación: Unificar todo a UpperCamelCase para consistencia con Prisma standards.
NOTE

Hardcoded Prompts Los prompts de la IA (en 
ai.service.ts
) contienen reglas de negocio "quemadas" en el código (ej: "Banco AV Villas", reglas de "Conjunto Residencial Treviso"). Esto dificulta la escalabilidad a otros clientes. Deberían moverse a configuración o base de datos.

