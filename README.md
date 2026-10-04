# DeskFlow

Aplicación de escritorio para gestionar ciclos de trabajo sentado/de pie/movimiento.

## Stack

- Tauri 2
- React + TypeScript
- Vite
- Lucide React
- Preparado para SQLite/local storage

## Estado del starter

Incluye:

- Dashboard
- Temporizador de ciclos
- Sentado / De pie / Movimiento
- Pausar / continuar / siguiente ciclo
- Notificaciones del navegador
- Estadísticas básicas
- Configuración inicial
- UI desktop responsive
- Estructura Tauri lista para evolucionar

## Ejecutar como web

```bash
npm install
npm run dev
```

## Ejecutar como aplicación Tauri

Necesitas Node.js y Rust/Tauri 2 instalados:

```bash
npm install
npm run tauri dev
```

## Próximas tareas recomendadas

1. Persistencia SQLite.
2. System tray.
3. Notificaciones nativas Tauri.
4. Autostart con el sistema.
5. Detección de inactividad real del sistema operativo.
6. Pausa automática al bloquear el equipo.
7. Motor de ciclos configurable.
8. Historial diario/semanal.
9. Modo Focus.
10. Empaquetado Windows `.msi` / `.exe`.
