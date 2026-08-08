# TinkerCraft

## Project overview

TinkerCraft is a client-side React, TypeScript, Three.js, and Vite 3D CAD editor.
The runnable web application is in `web-app/`.

## Running on Replit

The `Start application` workflow runs:

```bash
cd web-app && pnpm dev --host 0.0.0.0
```

The Vite development server listens on port 5000. Dependencies are installed
from `web-app/pnpm-lock.yaml` with `pnpm install`.

## User preferences

Preserve the existing application architecture and functionality when making
changes. Prefer small, targeted fixes over migrations or broad refactors.