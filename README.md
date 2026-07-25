# myCPC (Codename: AntiGravity) | The AI-Native Competitive Programming Gym.

A full-stack telemetry and coaching ecosystem designed to synthetically reconstruct and optimize the cognitive process of competitive programmers.

## Architecture

This project consists of several interacting components designed to provide a cohesive experience across the web, IDE, and browser.

### Data Flow

```
Chrome Extension -> sends payload to -> Port 10043 (VS Code) -> sends telemetry to -> Backend (Port 3002)
```

## Prerequisite Dependencies
- Node.js (v20.0.0 or higher)
- npm (v10 or higher)

## Setup Guide

### 1. Backend
- Navigate to the `backend/` directory.
- Copy `.env.example` to `.env` and fill in the necessary configuration (e.g. `PORT`, `JWT_SECRET`, `FRONTEND_URL`).
- Run `npm ci` (as per Strike Team Protocols) to install dependencies deterministically.
- Run `npm start` to start the backend server.

### 2. Frontend
- Navigate to the `frontend/` directory.
- Copy `.env.example` to `.env` and configure `VITE_BACKEND_URL` and `VITE_GOOGLE_CLIENT_ID`.
- Run `npm ci` to install dependencies.
- Run `npm run dev` to start the development server.

### 3. Chrome Extension
- Navigate to the `chrome-extension/` directory.
- Copy `config.example.js` to `config.js` and verify the `APP_CONFIG` endpoints.
- Open Chrome and navigate to `chrome://extensions/`.
- Enable "Developer mode".
- Click "Load unpacked" and select the `chrome-extension/` directory.

### 4. VS Code Extension
- Navigate to the `extension/` directory.
- Copy `.env.example` to `.env` or set in `config.json` depending on configuration style.
- Run `npm ci` to install dependencies.
- Open the directory in VS Code and press `F5` to launch the extension in a new Extension Development Host window.
