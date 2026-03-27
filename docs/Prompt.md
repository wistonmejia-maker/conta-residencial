# 🤖 Repositorio de Prompts Útiles

Este archivo almacena prompts estructurados y probados para interactuar efectivamente con asistentes de Inteligencia Artificial (AI) en el contexto del desarrollo de "Conta Residencial".

---

## 🐛 Pruebas y Revisión de Bugs (Debugging)

**Objetivo:** Pedirle a la IA que investigue un bug de forma controlada y sin modificar código sin tu consentimiento explícito. 

```text
Actúa como un desarrollador Senior experto en React, TypeScript y Node.js (Prisma). Necesito que me ayudes a auditar y encontrar un bug en mi código.

**Contexto del Problema:**
- **Lo que debería suceder:** [Ej: Al hacer clic en el botón "Pagar", el estado de la factura debe cambiar a PAGADO en la vista y en la base de datos].
- **Lo que está sucediendo actualmente (El bug):** [Ej: La base de datos guarda el estado como PAGADO, pero la tabla en el frontend sigue mostrando la factura como PENDIENTE hasta que recargo la página manualmente].

**Archivos involucrados (que yo sepa):**
1. [Ej: apps/web/src/pages/InvoicesPage.tsx] -> [Breve descripción de qué hace este archivo en este flujo].
2. [Ej: apps/api/src/routes/payments.ts] -> [Breve descripción].

**Pistas adicionales o pruebas que ya hice:**
- [Ej: Ya revisé el Network tab y el endpoint devuelve un código 200 OK].
- [Ej: Verifiqué que la fecha viaja bien en el JSON, pero en pantalla sale otra].

**Tu misión:**
1. Revisa los archivos que te mencioné utilizando tus herramientas de lectura.
2. Identifica dónde se rompe la lógica o dónde hay inconsistencias (ej. mutaciones de estado, promesas no resueltas, desfases de caché de React Query, o transacciones de base de datos mal manejadas).
3. No hagas cambios todavía. Primero explícame de forma concisa cuál es la raíz del problema y proponme un plan de implementación para solucionarlo.
```

---

## 🏗️ Creación de Nuevas Features o Módulos

**Objetivo:** Solicitar la estructura y desarrollo de una nueva funcionalidad desde cero utilizando tu propio "tech stack" y diseño.

```text
Actúa como un Arquitecto de Software Full-Stack. Necesitamos implementar una nueva funcionalidad llamada [Nombre del Módulo o Feature] en nuestra plataforma SaaS.

**Requisitos Funcionales:**
1. [Ej: Un botón que permita descargar todas las facturas en Excel].
2. [Ej: Solo debe estar visible para administradores].

**El Stack que utilizamos es:**
- Frontend: React (Vite), TailwindCSS, React Query.
- Backend: Node.js (Express), Prisma ORM, PostgreSQL.

**Instrucciones de Trabajo:**
1. Escribe un plan paso a paso detallando qué archivos vas a modificar y qué librerías vamos a usar (si es necesario agregar alguna).
2. Valida conmigo el plan. Si te doy el visto bueno, comienza escribiendo el código de backend (Modelos de Base de Datos y Endpoints). 
3. Una vez aprobado el backend, pasamos a desarrollar el UI del frontend asegurándonos de mantener los estilos SaaS (botones redondeados, colores neutros con acentos primarios, etc.).
```

---

## 🎨 Refactorización de Código (Clean Code)

**Objetivo:** Pedirle a la IA que limpie un archivo o componente muy largo, sucio o enredado.

```text
Necesito tu ayuda para refactorizar el código de este componente/archivo: [Ej: InvoicesPage.tsx o route/invoices.ts]. 

Actualmente el archivo tiene demasiadas responsabilidades y es difícil de mantener.

**Objetivo del Refactor:**
1. Extraer lógicas pesadas a **custom hooks** o utilidades (`lib/`).
2. Separar los sub-componentes visuales grandes (ej. modales, tablas) en archivos individuales de UI (ej. `components/ui/`).
3. Asegurar de que no se rompa la tipificación estricta de TypeScript.

**Acción Requerida:** 
Por favor analiza el archivo, dime cuáles partes planeas extraer en archivos separados, y espera mi confirmación antes de escribir los nuevos archivos.
```
