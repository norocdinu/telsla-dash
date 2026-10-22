// Values Vite bakes into the build (vite.config.ts `define`). Absent in tests, so read them with typeof.
// (moduleDetection is "force", so this file is a module and needs `declare global`.)
declare global {
  const __APP_VERSION__: string | undefined;
  const __APP_BUILD__: string | undefined;
}

export {};
