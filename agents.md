# MobilePad

## Overview

MobilePad is a Windows + Android project that lets you use your phone as a touchpad for a PC over the same Wi-Fi network.

- **Server (`/server`)**: Wails3 (Go) Windows desktop app that receives input over WebSocket and controls the mouse/keyboard.
- **Client (`/app`)**: React Native / Expo app that acts as a mobile touchpad and connects to the server.
- **Landing page (`/index.html`)**: Simple static page with download links, QR, screenshots, and gesture info.

## Project Structure

- `/server` - Wails3 Go server application
  - Start/Stop server controls
  - Shows connected clients and allows disconnecting them
  - Auto-tries the next port if the configured port is busy
  - WebSocket endpoint: `ws://<host>:<port>/ws`
  - Health endpoint: `http://<host>:<port>/health`
- `/app` - React Native / Expo mobile client
  - Auto-discovers the server on the local network
  - Full-screen touchpad with gestures, keyboard input, shortcuts, and settings
- `/github_images` - screenshots used by the landing page/README
- `/index.html` - landing page

## Design Language

Keep UI text in **English** across the app, server, and landing page.

### Color palette

**Dark mode**
- Background: `#0f141b`, `#0b1017`
- Card: `#18212d`
- Border: `#273445`
- Text: `#f3f7fb`
- Muted: `#97a8bc`
- Accent: `#66aaff`
- Brand/heading accent: `#FFF8E1`
- Primary action: `#2ecc71`

**Light mode**
- Background: `#fff8e1`, `#ffefbf`
- Card: `#fffdf5`
- Border: `#e6d39a`
- Text: `#3b2f10`
- Muted: `#7a6731`
- Accent: `#c58a00`
- Primary action: `#2ecc71`

## Server (Wails3 / Go)

### Requirements

- Go
- Wails3 CLI
- Node/npm for frontend build

### Build

From `server/`:

```powershell
.\build.bat
```

`build.bat` builds the server, compresses the executable with UPX, and outputs:

- `server/bin/Mobile Pad.exe`

Manual build/compress:

```powershell
wails3 build
.\upx-5.2.1-win64\upx.exe --best --lzma ".\bin\Mobile Pad.exe"
```

> UPX location: `server/upx-5.2.1-win64/upx.exe`

## Client (Expo / React Native)

### Requirements

- Node/npm
- Expo CLI / EAS CLI as needed

### Run in development

From `app/`:

```powershell
npm install
npx expo start
```

### Build Android (EAS)

From `app/`:

```powershell
npx eas-cli@latest build -p android --profile preview --non-interactive
```

Notes:
- Android package: `com.xajiraqab.mobilepad`
- Uses local credentials (`credentials.json`) for preview build
- `usesCleartextTraffic` is enabled for local HTTP/WS connection
- Min SDK 24, target/compile SDK 37

## Touchpad Gestures

- **Tap** - left click
- **Long press** - right click
- **Two-finger scroll** - scroll up/down
- **Double-tap, hold, and drag** - select text or drag items

## Notes

- Keep app and server UI text in English.
- After server build, compress the exe with UPX.
- If you change server frontend or Go code, rebuild the server exe.
- If you change mobile app code, reload in dev or create a new EAS build for APK.