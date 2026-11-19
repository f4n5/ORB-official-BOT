# Crypt3d Discord Bot

Bot de verificación (CAPTCHA) + **enlace con Crypt3d** (app de escritorio).

## Fix: `Cannot find module 'dotenv'`

Siempre instala dependencias **antes** de register/start:

```bash
npm install
npm run register
npm start
```

Sin `npm install`, Node no encuentra `dotenv`, `discord.js`, etc.

## Flujo Crypt3d

1. Admin: `/setup-verify` → mensaje + botón Verificar  
2. Usuario verifica (CAPTCHA) → rol **Miembro**  
3. Usuario: `/app-link` → código de 6 caracteres (10 min)  
4. App Crypt3d: pegar código → **Bienvenido @usuario** y desbloquea  

## API para la app

| Método | Ruta | Body / query |
|--------|------|----------------|
| `POST` | `/api/app/link` | `{ "code": "ABC123" }` |
| `GET`  | `/api/app/status` | `?discordId=...` |

Header opcional: `X-Api-Key` si defines `CRYPT3D_APP_API_KEY`.

## Variables de entorno

Copia `.env.example` → `.env`:

```env
DISCORD_TOKEN=
CLIENT_ID=
DISCORD_CLIENT_SECRET=
GUILD_ID=
PUBLIC_URL=https://tu-app.onrender.com
SESSION_SECRET=texto_largo_aleatorio
CRYPT3D_APP_API_KEY=   # opcional
```

## Discord Developer Portal

1. Bot token + intents: **Message Content**, **Server Members**  
2. OAuth2 Client ID + Secret  
3. Redirect: `https://TU-URL/auth/discord/callback`  
4. Invite con Manage Roles, Ban, Manage Messages, Moderate Members  

## Render / hosting

```bash
npm install
npm run register
npm start
```

Keep-alive: ping a `/ping` cada 5 min (UptimeRobot).

## Comandos

- `/setup-verify` — normas + Verificar  
- `/app-link` — código para Crypt3d (solo Miembro)  
- `/tryout-setup`, `/softban-setup`, levels, AutoMod, etc.
