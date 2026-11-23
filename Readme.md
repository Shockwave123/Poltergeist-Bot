# Poltergeist MD

[![Made with Baileys](https://img.shields.io/badge/Made%20with-Baileys-00bcd4?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B.19%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.5-blue?style=for-the-badge)](package.json)

Poltergeist MD is a self-hosted WhatsApp companion-device bot built with Node.js and [Baileys](https://github.com/WhiskeySockets/Baileys). Commands are organized under `commands/`; runtime configuration is in `config.js` and environment variables.

## Requirements

- Node.js `>=20.19`
- A WhatsApp account that you control
- A setup password of at least 16 characters

## Run locally

```powershell
git clone https://github.com/Shockwave123/Poltergeist-Bot.git
cd Poltergeist-Bot
npm install
$env:SETUP_PASSWORD = "use-a-private-password-of-at-least-16-characters"
$env:OWNER_NUMBER = "2348012345678"
npm start
```

Open the local setup page and enter `SETUP_PASSWORD` in the Poltergeist admin login. A successful login creates a 12-hour, HTTP-only session cookie. Use the QR code or request a pairing code, then confirm the link on the WhatsApp phone. The connection page and its API are protected; `/health` is intentionally public for monitoring.

## Deploy on Render

Create a Web Service from this repository and configure these environment variables in Render:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SETUP_PASSWORD` | Yes | Admin login password; use a unique secret of at least 16 characters. |
| `OWNER_NUMBER` | Yes | Your WhatsApp number with country code, digits only. Override the bundled fallback number. |
| `OWNER_NAME` | Optional | Comma-separated owner display names. |
| `SESSION_ID` | Optional | Session credential for restoring a login. Treat it as a password; a persistent disk is preferred. |
| `SEND_WELCOME` | Optional | Set to `false` to disable the non-sensitive welcome message; default is enabled. |
| `AUTO_RELINK` | Optional | Set to `false` to disable automatic relinking after logout; default is enabled. |
| `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_NIM_API_KEY` / `NVIDIA_API_KEY`, `ZAI_API_KEY` / `ZHIPUAI_API_KEY` | Optional | Configure one or more AI providers for AI and supported transcription features. |
| `OPENAI_API_KEY` | Optional | OpenAI transcription fallback. |
| `OPENWEATHER_API_KEY` | Optional | Enables the `.weather` command. |
| `USER_KEYS_ENCRYPTION_KEY` | Optional | Stable encryption secret for per-user API keys saved with `.aikey set`. |
| `NODE_ENV` | Blueprint default | The Render blueprint sets this to `production`. Render supplies `PORT` automatically. |

Runtime tuning variables such as `HEALTH_CHECK_INTERVAL_MS`, `MEMORY_LIMIT_MB`, `IDLE_PROBE_MS`, `QR_REFRESH_TIMEOUT_MS`, and `MAX_RECONNECT_DELAY_MS` have code defaults and normally do not need to be set. `BROWSER_TYPE` also defaults intentionally; do not set it to `ubuntu` for pairing. Visit the service URL and sign in to scan a QR code or request a pairing code. A persistent disk is recommended to preserve the complete Baileys auth state across redeploys. The free Render filesystem is ephemeral; an exported session credential is sensitive and should only be requested deliberately with the owner-only `.sessionid file` command in a private chat. The bot does not print credentials to logs or send them in its automatic welcome message.

The public health endpoint is `https://YOUR-SERVICE.onrender.com/health`. Free Render services can still suspend; an uptime monitor cannot guarantee that a free instance stays online.

## Baileys compatibility and responsible use

This repository currently pins `@whiskeysockets/baileys` to `7.0.0-rc14`, the current npm release verified for this update. It is a release candidate, not an official WhatsApp API. The pinned version is required by the repository's compatibility patch; review the [Baileys v7 migration guidance](https://whiskey.so/migrate-latest) and update that patch and connection tests before changing the pin. The socket uses event-based QR handling rather than the deprecated `printQRInTerminal` option, disables full-history sync, keeps online presence off, and supplies a message-store `getMessage` callback.

Baileys is unofficial and its maintainers discourage spam, bulk messaging, and stalkerware. This project is not affiliated with or endorsed by WhatsApp, and using it may violate WhatsApp's Terms of Service or lead to account restrictions. The cross-group `.broadcast` command is disabled. Use the bot only with accounts and groups you control, respect participants' consent, and do not use mass-mention or automated reply features for unsolicited messaging. This software cannot certify that a particular deployment or use complies with WhatsApp policies.

## Version and command index

The bot version is maintained in `package.json`. Refresh the generated version badge, dependency summary, and command index with:

```bash
npm run readme
```

<!-- stats:start -->
## 📊 Project Stats

> Auto-generated by `node scripts/update-readme.js` — do not edit this section by hand.

| | |
| --- | --- |
| 🤖 **Bot version** | `1.0.5` |
| ⚡ **Commands** | **248** across **9** categories (prefix `.`) |
| 📦 **Direct dependencies** | **27** |
| 🟢 **Node.js required** | `>=20.19` |

<details>
<summary><b>🗂️ Full command index (248)</b></summary>

#### 🧭 GENERAL · 36
`.account` · `.archive` · `.attp` · `.crop` · `.define` · `.dm`
`.expense` · `.getpp` · `.github` · `.groupinfo` · `.groupstats` · `.help`
`.journal` · `.learn` · `.list` · `.markread` · `.menu` · `.mutechat`
`.myactivity` · `.owner` · `.pin` · `.ping` · `.qr` · `.remind`
`.setupguide` · `.simage` · `.ssweb` · `.star` · `.sticker` · `.take`
`.transcribe` · `.translate` · `.tts` · `.uptime` · `.viewonce` · `.wikipedia`

#### 🤖 AI · 26
`.ai` · `.aikey` · `.bio` · `.debate` · `.deepread` · `.dream`
`.email` · `.explain` · `.factcheck` · `.fix` · `.flashcards` · `.gpt`
`.gptimage` · `.grammar` · `.imagine` · `.llama` · `.mistral` · `.persona`
`.poem` · `.recipe` · `.rephrase` · `.sentiment` · `.studyplan` · `.tweet`
`.vision` · `.workout`

#### 👾 ANIME · 2
`.anime` · `.random`

#### 📥 DOWNLOADERS · 10
`.audiomack` · `.deezer` · `.download` · `.itunes` · `.lyrics` · `.play`
`.soundcloud` · `.spotify` · `.tiktok` · `.youtube`

#### 🎭 FUN · 65
`.8ball` · `.babyname` · `.battle` · `.bestie` · `.bomb` · `.caption`
`.character` · `.choose` · `.coinflip` · `.compliment` · `.dare` · `.dice`
`.divorce` · `.enemy` · `.fact` · `.flirt` · `.fortune` · `.gayrate`
`.guessnumber` · `.hangman` · `.horoscope` · `.hotake` · `.hotseat` · `.howdumb`
`.howgay` · `.hug` · `.insult` · `.iqrate` · `.joke` · `.kiss`
`.marry` · `.meme` · `.memesearch` · `.mentionking` · `.mood` · `.mostactive`
`.mostquiet` · `.nhie` · `.nightowl` · `.pick` · `.pies` · `.poke`
`.profession` · `.quote` · `.rate` · `.rizzrate` · `.roastai` · `.roastbattle`
`.roastoftheday` · `.roulette` · `.rps` · `.ship` · `.simprate` · `.slap`
`.slots` · `.soulmate` · `.stickerking` · `.story` · `.tictactoe` · `.toxicrate`
`.trivia` · `.truth` · `.wanted` · `.weeklymvp` · `.wyr`

#### 🔧 UTILITY · 21
`.age` · `.ascii` · `.binary` · `.bmi` · `.calc` · `.color`
`.convert` · `.countdown` · `.currency` · `.datecalc` · `.emoji` · `.encode`
`.ip` · `.password` · `.randomnum` · `.shorturl` · `.time` · `.tip`
`.todo` · `.vocab` · `.weather`

#### 🖋️ TEXTMAKER · 21
`.1917` · `.arena` · `.blackpink` · `.codm` · `.devil` · `.efootball`
`.fire` · `.glitch` · `.hacker` · `.ice` · `.impressive` · `.leaves`
`.light` · `.matrix` · `.metallic` · `.neon` · `.pubg` · `.purple`
`.sand` · `.snow` · `.thunder`

#### 🛡️ ADMIN · 32
`.adminsummary` · `.antibadword` · `.antigroupmention` · `.antigroupstatus` · `.antilink` · `.antisticker`
`.antitag` · `.autosticker` · `.chatbot` · `.clean` · `.delete` · `.demote`
`.goodbye` · `.grouplink` · `.groupstatus` · `.hidetag` · `.kick` · `.leave`
`.lock` · `.mute` · `.pending` · `.promote` · `.resetwarn` · `.revoke`
`.setgoodbye` · `.setwelcome` · `.tagadmins` · `.tagall` · `.unmute` · `.warn`
`.warnlist` · `.welcome`

#### 👑 OWNER · 35
`.afk` · `.anticall` · `.apikeys` · `.archiveall` · `.autochat` · `.autoreact`
`.autoread` · `.autostatus` · `.block` · `.blocklist` · `.broadcast` · `.clearcache`
`.getss` · `.googleai` · `.health` · `.mode` · `.newsletter` · `.privacy`
`.private` · `.public` · `.pushname` · `.readall` · `.restart` · `.session`
`.setbio` · `.setbotname` · `.setbotpp` · `.setmenuimage` · `.setnewsletter` · `.setprefix`
`.stats` · `.sudo` · `.unblock` · `.update` · `.wafeed`

</details>
<!-- stats:end -->

## Credits and license

This project uses [Baileys](https://github.com/WhiskeySockets/Baileys) and other open-source packages listed in `package.json`. Poltergeist MD is distributed under the MIT license. Keep relevant upstream notices and comply with the licenses of all dependencies.
