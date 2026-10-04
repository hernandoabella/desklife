/**
 * Test environment shim.
 *
 * Node 22+ ships an experimental global `localStorage` that is undefined unless
 * --localstorage-file is passed. That global occupies the slot jsdom's own
 * localStorage would use, so `window.localStorage` comes back undefined and
 * every storage-backed test dies in beforeEach.
 *
 * Running the suite with NODE_OPTIONS=--no-experimental-webstorage also fixes
 * it, but that is shell-specific. Installing an in-memory Storage here keeps
 * `npm test` working identically on Windows cmd, PowerShell and POSIX shells.
 */

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();

  return {
    get length() {
      return map.size;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return map.has(String(key)) ? (map.get(String(key)) as string) : null;
    },
    setItem(key: string, value: string): void {
      map.set(String(key), String(value));
    },
    removeItem(key: string): void {
      map.delete(String(key));
    },
    clear(): void {
      map.clear();
    },
  };
}

if (typeof window !== "undefined" && !window.localStorage) {
  Object.defineProperty(window, "localStorage", {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}