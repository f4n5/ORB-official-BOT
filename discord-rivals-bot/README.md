# Discord Rivals Bot

Bot de Discord con verificación por CAPTCHA (solo Discord, sin Roblox).

## Funciones

- ✅ Mensaje de normas + botón **Verificar**
- ✅ CAPTCHA en la web → rol **Miembro**
- ✅ AutoMod: AntiSpam, AntiPhishing, AntiWords + editor (gg/ez/p2w/p2l)
- ✅ Soft Ban (canal especial) + `/softban-setup` (envía la alerta)
- ✅ `/tryout-setup` (mensaje con botón de login → avisa a Owner/Admin y al usuario)
- ✅ Niveles por mensajes (`/level`, `/leaderboard`)
- ✅ `/lineup @usuario` (Admin/Owner)
- ✅ Página web con login Discord + botón **Hacer pruebas** (DL / SDL / CL)
- ✅ Listo para Render + keep-alive

## Novedades / arreglos

- **CAPTCHA instantáneo**: el botón *Verificar* abre un modal dentro de Discord (sin web). La web queda como botón alternativo.
- **Tryouts sin login**: botón *Solicitar tryout* (no depende de OAuth, así funciona aunque Discord bloquee la IP de Render). Los botones del staff: Tomar / Aprobar (da rol LineUp) / Rechazar.
- **Login web**: ya no se reinicia en bucle si Discord bloquea (eso agravaba el bloqueo de la IP); reintentos con espera, timeouts y mensajes claros.
- **Niveles**: ahora se guardan (faltaba la carpeta `data/`) y avisan al subir de nivel. En Render usa un disco persistente en `/data` o los niveles se borran al redeplegar.
- **Comandos nuevos**: `/help` `/ping` `/userinfo` `/serverinfo` `/avatar` `/poll` `/clear` `/announce`.
- Tip Render gratis: crea un monitor en UptimeRobot a `https://TU-APP.onrender.com/ping` cada 5 min.

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
PUBLIC_URL=https://tu-app.onrender.com   # sin "/" al final
SESSION_SECRET=un_texto_largo_y_aleatorio
SOFTBAN_ALERT_MESSAGE=   # opcional
```

## Discord Developer Portal

1. New Application → Bot → Token + intents (Message Content + Server Members)
2. OAuth2 → Client ID + Client Secret
3. OAuth2 → Redirects: `https://TU-APP.onrender.com/auth/discord/callback`
4. Invita el bot con Manage Roles, Ban Members, Manage Messages, **Moderate Members** (timeouts) y **Manage Server** (opcional: permite al AutoMod distinguir invites propios de ajenos)

## Render

1. Web Service → `npm install` / `npm start`
2. Pega las variables de entorno
3. Keep-alive cada 5 min a `/ping`

## Comandos

```bash
npm run register
```

Luego, en Discord: `/setup-verify`, `/tryout-setup` y `/softban-setup`.

> Si cambias o agregas comandos, vuelve a ejecutar `npm run register`.
