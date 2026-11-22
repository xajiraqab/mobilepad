# MobilePad - Project Notes

## Project Idea

MobilePad is a project that lets you control a laptop/PC cursor from a phone, similar to a touchpad.

## Structure

- `/server` - Wails3 (Go) application that acts as the server.
  - Provides **Start/Stop** and **Status** controls.
  - Handles touch/input commands from the phone and moves the computer cursor.
- `/app` - React Native / Expo application.
  - Works as a mobile touchpad client and connects to the server to control the cursor.

## Language

- Keep the app and server UI/text in **English**.

## Server Build & UPX

After building the server, compress the generated `.exe` with UPX to reduce file size.

- UPX location: `server/upx-5.2.1-win64/upx.exe`
- Example (from `server` directory):

```powershell
# build
wails3 build

# compress
.\upx-5.2.1-win64\upx.exe --best --lzma ".\bin\Mobile Pad.exe"
```

> Note: Verify the exact generated exe name/path in `bin/`, as it may vary depending on template/packaging.
