# Cron Scanner Service

Servicio ligero para ejecutar escaneos automáticos de Gmail via Railway Cron.

## Configuración en Railway

### 1. Crear Nuevo Servicio

1. En Railway Dashboard, click **"New Service"** → **"Empty Service"**
2. Conectar a este repo, pero en la configuración:
   - **Root Directory**: `apps/cron`
   - **Start Command**: `node index.js`

### 2. Variables de Entorno

Agregar en el servicio cron:

```
API_URL=https://conta-residencial-production.up.railway.app
CRON_SECRET=tu-secreto-seguro-aqui
```

> ⚠️ **Importante**: El mismo `CRON_SECRET` debe estar en el servicio API.

### 3. Configurar Cron Schedule

En **Settings → Cron Schedule**, usar:

| Frecuencia | Expresión Cron |
|:-----------|:---------------|
| Cada hora | `0 * * * *` |
| Cada 30 min | `*/30 * * * *` |
| Cada 6 horas | `0 */6 * * *` |
| Diario 6 AM | `0 6 * * *` |

> Nota: Railway usa **UTC**, así que ajusta según tu zona horaria.

### 4. Agregar CRON_SECRET al API

En el servicio **API** de Railway, agregar variable:

```
CRON_SECRET=tu-secreto-seguro-aqui
```

## Verificación

El servicio se ejecutará según el schedule y verás logs como:

```
[Cron] Starting auto-scan trigger at 2026-01-18T21:00:00.000Z
[Cron] API URL: https://conta-residencial-production.up.railway.app
[Cron] ✅ Success: { "success": true, "scanned": 2 }
[Cron] Completed at 2026-01-18T21:00:02.000Z
```

## Alternativa: Servicio Externo

Si no quieres crear un servicio en Railway, puedes usar:

- **cron-job.org** (gratis, limite 1 req/min)
- **EasyCron** (gratis para pocas tareas)
- **GitHub Actions** (workflow scheduled)

Ejemplo con cron-job.org:
1. Crear cuenta en https://cron-job.org
2. New Cron Job:
   - URL: `https://conta-residencial-production.up.railway.app/api/scan/cron/scan-all`
   - Method: POST
   - Headers: `x-cron-secret: tu-secreto`
   - Schedule: Every hour
