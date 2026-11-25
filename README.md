# La Vaca

PWA mobile-first para dividir cuentas de restaurantes, pedidos o vacas de cuota fija en Colombia usando **Bre-B**, **Nequi**, **Daviplata** y **Bancolombia**, sin obligar a los invitados a registrarse.

## Stack Técnico

- **Next.js 15 (App Router)** + **TypeScript** + **Tailwind CSS v4**
- **Iconos:** `lucide-react`
- **Base de datos y Realtime:** `@supabase/supabase-js`
- **IA (Escaneo de facturas):** `@google/genai` con `gemini-2.5-flash` y Structured Outputs (`responseSchema`)

## Configuración rápida

### 1. Variables de entorno

Copia `.env.example` a `.env.local` y completa tus credenciales:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-de-supabase
GEMINI_API_KEY=tu-api-key-de-gemini
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Base de datos y Realtime en Supabase

Abre el **SQL Editor** de tu proyecto en Supabase y ejecuta completo el archivo [`supabase/schema.sql`](./supabase/schema.sql).

Esto crea las tablas `rooms`, `items`, `participants` y `item_claims`, activa `REPLICA IDENTITY FULL`, las añade a `supabase_realtime` y configura las políticas RLS para el MVP sin registro.

### 3. Ejecutar localmente

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Scripts disponibles

- `npm run dev` — Servidor local con Turbopack
- `npm run build` — Compilación de producción
- `npm run typecheck` — Verificación estricta de TypeScript
- `npm run lint` — ESLint de Next.js
- `npm test` — Pruebas unitarias de formato COP y lógica matemática de división
