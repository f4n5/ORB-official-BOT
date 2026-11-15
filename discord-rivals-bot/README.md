# Discord Rivals Bot

Bot de Discord con verificación por CAPTCHA (solo Discord, sin Roblox).

## Funciones

- ✅ Mensaje de normas + botón **Verificar**
- ✅ CAPTCHA en la web → rol **Miembro**
- ✅ AutoMod: AntiSpam, AntiPhishing, AntiWords + editor (gg/ez/p2w/p2l)
- ✅ Soft Ban (canal especial)
- ✅ Niveles por mensajes (`/level`, `/leaderboard`)
- ✅ `/lineup @usuario` (Admin/Owner)
- ✅ Página web con login Discord + botón **Hacer pruebas** (DL / SDL / CL)
- ✅ Listo para Render + keep-alive

## Flujo de verificación

1. Admin: `/setup-verify` → mensaje con botón
2. Usuario pulsa **Verificar**
3. Abre el enlace del CAPTCHA
4. Resuelve la suma
5. Bot asigna rol **Miembro** → ve los canales

## Variables de entorno

```env
DISCORD_TOKEN=
CLIENT_ID=
DISCORD_CLIENT_SECRET=
GUILD_ID=
SOFTBAN_CHANNEL_ID=
TESTS_CHANNEL_ID=
PUBLIC_URL=https://tu-app.onrender.com
```

## Discord Developer Portal

1. New Application → Bot → Token + intents (Message Content + Server Members)
2. OAuth2 → Client ID + Client Secret
3. OAuth2 → Redirects: `https://TU-APP.onrender.com/auth/discord/callback`
4. Invita el bot con Manage Roles, Ban Members, Manage Messages, etc.

## Render

1. Web Service → `npm install` / `npm start`
2. Pega las variables de entorno
3. Keep-alive cada 5 min a `/ping`

## Comandos

```bash
npm run register
```

Luego `/setup-verify` en Discord.
