<div align="center">

## Poltergeist MD

[![Made with Baileys](https://img.shields.io/badge/Made%20with-Baileys-00bcd4?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

<img src="utils/bot_image.jpg" alt="Poltergeist MD" width="260">

</div>

Poltergeist MD is a WhatsApp MD bot built on top of the **Baileys** library.  
It’s designed to be fast, lightweight, and easy to customize without touching the core code.  
This project is **fully open source** — you can modify it, rebrand it, and make your **own bot** from this codebase **free of cost**, without needing any permission from our side.  
All commands and the overall structure are written in a way that makes customization (bot image, prefix, name, features, etc.) as easy as possible.

---


## ✨ Features

- **Fully Open Source** – entire codebase is editable; host it anywhere (Heroku, panel, VPS, etc.).  
- **Easy Customization via Commands** – change **bot image**, **prefix**, **channel/newsletter**, **bot name**, etc. with simple commands.  
- **Modular Command System** – commands are organized in the `commands` folder for easy editing.  
- **Optimized for Stability** – RAM‑optimized media handling (streaming, temp cleanup), better session handling via `sessionID` in `config.js`.  
- **Owner Utilities** – restart, update from ZIP, and more owner‑only tools.

---

### 1. Fork the Repository

<div align="center">

<a href="https://github.com/yourusername/poltergeist-md/fork" target="_blank">
  <img src="https://img.shields.io/badge/Fork%20Repository-GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Fork on GitHub">
</a>

</div>

> This creates your own copy of `Poltergeist MD` under your GitHub account.

---

### 2. Get Pair Code

Deploy a small helper to generate a **pair code** and obtain your session string.

<div align="center">

<a href="https://your-paircode-service.example.com/" target="_blank">
  <img src="https://img.shields.io/badge/Generate-Pair%20Code-blueviolet?style=for-the-badge" alt="Generate Pair Code">
</a>

</div>

After scanning, you will receive a **session string** starting with:

```text
PoltergeistMD!H4....
```

Copy that full string and paste it into `config.js`:

```js
sessionID: 'PoltergeistMD!H4.....'
```

Or set it via the `SESSION_ID` environment variable when hosting.

---

### 3. Deploy on Panel (Katabump, etc.)

<div align="center">

<a href="https://dashboard.katabump.com/auth/login#d6b7d6" target="_blank">
  <img src="https://img.shields.io/badge/Deploy%20on-Katabump-orange?style=for-the-badge" alt="Deploy on Katabump">
</a>

</div>

For a full step‑by‑step deployment tutorial (panels / VPS / Heroku), add or update your YouTube guide here:

- **YouTube Tutorial:** *(coming soon)*

---

## 🛠 Local Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/yourusername/poltergeist-md.git
cd poltergeist-md
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Configure session

Edit `config.js`:

- **Option A: Use session string**

  ```js
  sessionID: 'PoltergeistMD!H4.....'
  ```

- **Option B: Scan QR**

  ```js
  sessionID: ''
  ```

  Run the bot and scan the QR from the terminal.

### 4️⃣ Run the bot

```bash
node index.js
```

When the bot starts:

- If `sessionID` is empty, a **QR code** will appear in the terminal – scan it using **Linked Devices** in WhatsApp.  
- If `sessionID` is set, it will log in using that session string.

---

## Render Connection Setup

After deploying as a Render Web Service, open the service URL shown by Render. The setup page provides two connection methods:

- **QR code:** scan it from WhatsApp > Linked devices > Link a device.
- **Pairing code:** enter the WhatsApp number with its country code, without `+`, spaces, or punctuation, then enter the generated code in WhatsApp > Linked devices > Link with phone number.

After either method succeeds, copy the `SESSION_ID` printed in the Render logs and add it as a Render environment variable. Render's free service filesystem is temporary, so using `SESSION_ID` prevents the bot from needing to be linked again after a restart or redeploy.

### Keeping a Render Free Service Available

The bot exposes `https://YOUR-SERVICE.onrender.com/health` for uptime monitoring. Add that URL to an external monitor such as UptimeRobot with a five-minute interval. This can reduce idle wake-up delays, but Render may still suspend free services according to its current free-tier policy; a script running inside the sleeping service cannot reliably prevent that. A paid Render instance is the reliable always-on option.

Each Render service stores one WhatsApp account. A new QR is generated whenever that service starts a fresh unauthenticated session. Do not share one service between multiple users; deploy a separate service and `SESSION_ID` for each account.

The welcome message sent after connection includes a short bot introduction and warns about credentials. The real `SESSION_ID` is intentionally never sent in WhatsApp because it is a private login credential.

<div align="center">
</div>

---

## 🙏 Credits

- **Baileys** – WhatsApp Web API library (`@whiskeysockets/baileys`)  
- Other open‑source libraries listed in `package.json`

---

## ⚠️ Important Warning

- This bot is created **for educational purposes only**.  
- This is **NOT** an official WhatsApp bot.  
- Using third‑party bots **may violate WhatsApp’s Terms of Service** and can lead to your account being **banned**.

> You use this bot **at your own risk**.  
> The developers are **not responsible** for any bans, issues, or damages resulting from its use.

---

## 📝 Legal

- This project is **not affiliated with, authorized, maintained, sponsored, or endorsed** by WhatsApp Inc. or any of its affiliates or subsidiaries.  
- This is **independent and unofficial software**.  
- **Do not spam** people using this bot.  
- **Do not** use this bot for bulk messaging, harassment, or any **illegal activities**.  
- The developers assume **no liability** and are **not responsible** for any misuse or damage caused by this program.

---

## 📄 License (MIT)

This project is licensed under the **MIT License**.

You must:

- Use this software in compliance with **all applicable laws and regulations**.  
- Keep the **original license and copyright** notices.  
- **Credit the original authors**.  
- **Not** use this for spam, abuse, or malicious purposes.

---

## 📜 Copyright Notice

Copyright (c) **2026 Professor**.  
All rights reserved.

This project contains code from various open‑source projects and AI tools, including but not limited to:

- **Baileys** – MIT License  
- Other libraries as listed in `package.json`

