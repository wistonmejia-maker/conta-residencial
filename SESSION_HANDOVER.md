# Resumen de Sesión: Optimización Scan Gmail y UX

## Estado Actual (17 Enero 2026)
El sistema de escaneo de facturas desde Gmail ha sido optimizado para producción con las siguientes características:

### 1. Experiencia de Usuario (Frontend - `InvoicesPage.tsx`)
- **Widget Flotante**: Al minimizar la ventana de escaneo, aparece un widget en la esquina inferior derecha que muestra el progreso.
- **Carga en Tiempo Real**: La tabla de facturas se refresca automáticamente cada vez que se procesa un nuevo ítem.
- **Feedback de IA**: Botón "🧠 Reportar Error" funcional para alimentar reglas dinámicas.
- **Visualización**: Se muestra el asunto del correo e indicador "📧 Gmail".

### 2. Backend y Procesamiento (`scan.ts`, `ai.service.ts`)
- **Descripciones Inteligentes**: La IA genera resúmenes cortos ("Vigilancia Enero") en lugar de textos genéricos.
- **Subida de Archivos**: Configurado para usar Cloudinary en producción (usando las credenciales actualizadas en Railway).
- **Etiquetado Gmail**: Marca los correos procesados con la etiqueta `MejIA_Processed` en verde.

### 3. Configuración
- **Base de Datos**: Script `reset-data.ts` disponible para limpiar pruebas.
- **Variables**: Las credenciales de Cloudinary deben estar configuradas en el entorno (Railway/Vercel).

## Archivos Clave para la Próxima Sesión
Si necesitas continuar trabajando en esto, los archivos principales son:

1.  **Frontend**: `apps/web/src/pages/InvoicesPage.tsx` (Lógica de UI, Widget, Tabla).
2.  **Contexto**: `apps/web/src/lib/AIContext.tsx` (Estado global del escáner).
3.  **Backend Scan**: `apps/api/src/routes/scan.ts` (Procesamiento de correos, subida de archivos, creación de facturas).
4.  **Lógica IA**: `apps/api/src/services/ai.service.ts` (Prompts y reglas dinámicas).

## Pendientes / Siguientes Pasos
- Monitorear el rendimiento del escaneo con volúmenes grandes de correos.
- Verificar que la etiqueta `MejIA_Processed` se aplique correctamente en todos los escenarios.
