# DeskFlow

Aplicación de escritorio para gestionar ciclos de trabajo sentado / de pie / movimiento.

## Stack

- Tauri 2
- React 19 + TypeScript
- Vite
- Lucide React
- Persistencia local (`localStorage`), preparada para SQLite

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

## Calidad

```bash
npm run typecheck
npm run test
npm run check
```

## Qué hace

- Temporizador de ciclos con reloj real (no se desincroniza si la ventana pierde el foco o el equipo duerme)
- Motor de ciclos configurable: cualquier secuencia de pasos sentado / de pie / movimiento, con duraciones y modos editables
- Presets: clásico 50/10/5, setup mínimo, reuniones largas, ritmo corto
- Pausar / continuar / saltar / reiniciar, con atajos de teclado (`espacio`, `→`, `R`, `1`/`2`/`3`)
- Historial diario real y persistido, estadísticas de 7 / 30 / 90 días, racha de días y progreso contra la meta
- Gráfico de barras con línea de objetivo, derivado de las fechas reales (no de datos inventados)
- Pausa automática por inactividad, con umbral configurable
- Notificaciones nativas cuando corre dentro de Tauri, con fallback a las del navegador
- Onboarding de primer arranque
- Tema claro / oscuro / del sistema, y vista compacta de reloj grande
- Recuperación de sesión: si la app se cerró con un ciclo a medias, se reconstruye sin contar el tiempo ausente como trabajo

## Arquitectura

```
src/
  core/
    types.ts                  Tipos y valores por defecto
    timer/reducer.ts          Máquina de estados pura del temporizador
    timer/useTimer.ts         Puente entre el reducer y el reloj real
    storage/storage.ts        Ajustes, historial, racha, series diarias
    activity/notifications.ts Notificaciones nativas / navegador
    activity/theme.ts         Resolución y aplicación del tema
  components/                 TimerCard, StatsPanel, SettingsPanel, Onboarding
tests/                        Vitest sobre el reducer y el almacenamiento
```

El temporizador es un `useReducer` puro: todas las transiciones reciben `now` como parámetro, así que es determinista y testeable sin temporizadores reales.

## Estado del empaquetado

`npm run tauri build` requiere Node.js **y** Rust. La parte Rust de este repositorio no se ha compilado en el entorno donde se escribió, así que verifica `src-tauri/` en tu máquina antes de publicar.

## Próximas tareas recomendadas

1. System tray con el countdown en el tooltip.
2. SQLite mediante `tauri-plugin-sql` en lugar de `localStorage`.
3. Detección de inactividad del sistema operativo (`GetLastInputInfo`) en vez de eventos de input de la web.
4. Pausa automática al bloquear el equipo.
5. Presets por día de la semana / fin de semana.
6. Modo Focus: silencia notificaciones en bloques de 25/5.
7. Exportar e importar preferences e historial en JSON.
8. Empaquetado y firma Windows `.msi` / `.exe`.
9. Integración de tests end-to-end con Playwright.