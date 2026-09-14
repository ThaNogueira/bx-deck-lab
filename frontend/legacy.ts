// Temporary typed boundary; shared.js owns navigation and existing session cookies.
export interface User { id: string; name: string; slug: string }
export interface Site { googleLogin: boolean; devLogin: boolean }
interface LegacyBridge {
  renderTopbar(active: string | null): void;
  me(): Promise<User | null>;
  site(): Promise<Site>;
  api<T = unknown>(path: string, options?: { method?: string; body?: unknown }): Promise<T>;
  toast(message: string): void;
  ICON_GROUPS: Record<string, string[]>;
  EMOJIS: Record<string, string>;
}
declare global { interface Window { BX: LegacyBridge } }
export const bx = window.BX;
