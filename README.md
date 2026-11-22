# MobilePad

MobilePad lets you use your Android phone as a touchpad for your Windows PC over the same Wi-Fi network.

## Download

- **Windows:** [MobilePad.exe](https://github.com/xajiraqab/mobilepad/releases/latest/download/MobilePad.exe)
- **Android:** [mobilepad.apk](https://github.com/xajiraqab/mobilepad/releases/latest/download/mobilepad.apk)

## How It Works

1. **Start the server** - Download and open Mobile Pad on your Windows PC.
2. **Get the Android app** - Install the APK on your phone.
3. **Same Wi-Fi** - Connect both devices to the same Wi-Fi network.
4. **Connect & control** - Open the app; it discovers and connects to the server automatically.

## Touchpad Gestures

| Gesture | Action |
|---|---|
| **Tap** | Left click |
| **Long press** | Right click |
| **Two-finger scroll** | Scroll up and down |
| **Double-tap, hold, and drag** | Select text or drag items |

## Screenshots

<p align="center">
  <img src="github_images/1.jfif" alt="Mobile Pad screenshot 1" width="220" />
  <img src="github_images/2.jfif" alt="Mobile Pad screenshot 2" width="220" />
  <img src="github_images/3.jfif" alt="Mobile Pad screenshot 3" width="220" />
</p>
<p align="center">
  <img src="github_images/4.jfif" alt="Mobile Pad screenshot 4" width="220" />
  <img src="github_images/5.jfif" alt="Mobile Pad screenshot 5" width="220" />
  <img src="github_images/6.jfif" alt="Mobile Pad screenshot 6" width="220" />
</p>

## Tech Stack

- **Server:** Wails3 + Go (Windows)
- **Client:** React Native + Expo (Android)
- **Connection:** WebSocket over local Wi-Fi

## Development

### Server

```powershell
cd server
.\build.bat
```

Output: `server/bin/Mobile Pad.exe`

### Client

```powershell
cd app
npm install
npx expo start
```

Build Android APK with EAS:

```powershell
cd app
npx eas-cli@latest build -p android --profile preview --non-interactive
```