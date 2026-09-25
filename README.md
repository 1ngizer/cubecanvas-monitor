# CubeCanvas Monitor (`cubecanvas-monitor`)

Panel interno privado en vivo para evaluar y auditar el estado operativo de todas las aplicaciones y servicios de la arquitectura CubeCanvas mediante un sistema de semáforos (Verde / Amarillo / Rojo / Gris), medición de latencia en milisegundos, visualización del último error detectado y línea de tiempo histórica de las últimas 24 horas.

---

## 🚀 Características Principales

- **Chequeos de solo lectura**: Cada 10 minutos (y al iniciar el servidor), sin operaciones destructivas ni mutaciones de datos.
- **Acceso estrictamente restringido**: Solo accesible para `admin@cubecanvas.com` autenticado mediante Supabase Auth (Google OAuth).
- **Semáforo por servicio**:
  - 🟢 **Verde (OK)**: Servicio respondiendo dentro de los parámetros esperados.
  - 🟡 **Amarillo (Degradado)**: Latencia >3000ms o certificados TLS próximos a vencer (<14 días).
  - 🔴 **Rojo (Caído / Crítico)**: Error HTTP (4xx/5xx), fallas de conexión, renders pendientes >15 min o pagos estancados >24 h.
  - ⚪ **Gris (No configurado)**: Credencial API opcional no suministrada en las variables de entorno.
- **Auditoría de seguridad en frontend**: Verificación estricta mediante `npm run audit:bundle` para garantizar que ninguna clave privada o service role key se filtre en el bundle de cliente.
- **Resiliencia de almacenamiento**: Registro dual en Supabase (`public.health_checks`) con respaldo automático en buffer en memoria de 24 horas si la base de datos no está disponible.

---

## 🛠️ Servicios Evaluados (9 Grupos)

| Servicio | Tipo / Endpoint | Criterio de Éxito | Estado si falla |
|---|---|---|---|
| **Backend CubeCanvas** | GET `/health` en Railway | HTTP 200 y JSON `{"ok":true,"service":"cubecanvas-backend"}` | 🔴 Rojo |
| **Frontend CubeCanvas** | GET `/` en Railway | HTTP 200 y referencia a asset JS activo (`/assets/index-*.js`) | 🔴 Rojo |
| **Dominios & Certificados** | DoH Cloudflare + HTTPS | CNAME de `www` y `app` apuntando a `.up.railway.app`, apex 200, TLS >14 días | 🔴 Rojo / 🟡 Amarillo |
| **Supabase Core** | Ping SQL / REST | Latencia <500ms, renders pendientes >15m = 0, pagos >24h = 0 | 🔴 Rojo / 🟡 Amarillo |
| **Anthropic API** | `claude-sonnet-5` (5 tokens) | Ping sintético seguro (`thinking: { type: "disabled" }`), caché 30m | 🔴 Rojo / ⚪ Gris |
| **WhatsApp / Meta Graph API** | Graph API v22.0 + Webhook | Consulta a Phone Number ID y verificación handshake GET con `hub.challenge` | 🔴 Rojo / ⚪ Gris |
| **Pasarela de Pagos (Wompi)** | Merchant status API | Sandbox y producción (`/merchants/{public_key}`) responden `ACTIVE` | 🔴 Rojo / ⚪ Gris |
| **Resend (Email)** | GET `/domains` | Al menos un dominio remitente con estado `verified` | 🔴 Rojo / ⚪ Gris |
| **Servicios Externos** | Calendly, Web App, GitHub | Calendly 200, Web App 200, Repos GitHub accesibles | 🔴 Rojo / ⚪ Gris |

---

## 🔒 Seguridad y Autenticación

1. **Rutas protegidas**: Todas las rutas bajo `/api/*` (excepto `/health`) requieren un header `Authorization: Bearer <SUPABASE_JWT>`.
2. **Validación de rol/correo**: El middleware valida criptográficamente el token con Supabase y exige que `user.email === "admin@cubecanvas.com"` (configurable mediante `ADMIN_EMAIL`).
3. **Sin tokens de desarrollo / backdoors**: No existen claves estáticas, bypasses ni rutas no autenticadas en producción.
4. **Row Level Security (RLS)**: La tabla `public.health_checks` en Supabase tiene RLS habilitado y no otorga permisos de lectura ni escritura al rol `anon`.

---

## 📋 Variables de Entorno

Copia el archivo `.env.example` a `.env` y configura los valores correspondientes:

```bash
cp .env.example .env
```

| Variable | Descripción | Requerido |
|---|---|---|
| `PORT` | Puerto de escucha del servidor (por defecto 3000) | No |
| `NODE_ENV` | Entorno (`production` o `development`) | No |
| `ADMIN_EMAIL` | Correo del administrador autorizado (`admin@cubecanvas.com`) | Sí |
| `SUPABASE_URL` | URL del proyecto Supabase `cubecanvas-core` | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave Service Role de Supabase (solo servidor backend) | Sí |
| `VITE_SUPABASE_URL` | URL pública de Supabase expuesta al cliente | Sí |
| `VITE_SUPABASE_ANON_KEY` | Anon Key pública de Supabase para el cliente | Sí |
| `ANTHROPIC_API_KEY` | Clave API de Anthropic | Opcional (Gris si falta) |
| `WHATSAPP_TOKEN` | Token de sistema de Meta Graph API | Opcional (Gris si falta) |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador de número telefónico de WhatsApp | Opcional (Gris si falta) |
| `WOMPI_PUBLIC_KEY` | Llave pública Sandbox de Wompi | Opcional (Gris si falta) |
| `WOMPI_PUBLIC_KEY_PROD` | Llave pública de Producción de Wompi | Opcional (Gris si falta) |
| `RESEND_API_KEY` | Clave API de Resend | Opcional (Gris si falta) |
| `GITHUB_TOKEN` | Personal Access Token de GitHub para repos privados | Opcional (Gris si falta) |

---

## 🗄️ Migración de Base de Datos

Ejecuta el script SQL en el editor SQL de tu panel de Supabase:

```sql
-- Archivo: db/migrations/001_create_health_checks.sql
create table if not exists public.health_checks (
    id bigserial primary key,
    service_key text not null,
    service_name text not null,
    category text not null,
    status text not null check (status in ('green', 'yellow', 'red', 'gray')),
    latency_ms integer not null default 0,
    error_message text,
    details jsonb,
    checked_at timestamptz not null default now()
);

alter table public.health_checks enable row level security;

create index if not exists idx_health_checks_service_time 
on public.health_checks (service_key, checked_at desc);

create index if not exists idx_health_checks_time 
on public.health_checks (checked_at desc);
```

---

## 💻 Desarrollo Local

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar en modo desarrollo
npm run dev

# 3. Compilar cliente y servidor
npm run build

# 4. Auditar bundle en busca de fugas de secretos
npm run audit:bundle

# 5. Ejecutar en producción local
npm start
```

---

## ☁️ Despliegue en Railway

El proyecto incluye las configuraciones nativas `railway.json` y `nixpacks.toml`:

```bash
# Iniciar proyecto en Railway
railway init --name cubecanvas-monitor

# Desplegar a Railway
railway up -y -d --service cubecanvas-monitor

# Generar dominio público
railway domain --service cubecanvas-monitor
```
