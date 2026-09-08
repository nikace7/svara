import type { Locale, ProviderMode } from '@svara/contracts';

/** Provider lifecycle boundary; live and fixture adapters arrive in M1. */
export interface ProviderContext {
  locale: Locale;
  mode: ProviderMode;
  signal: AbortSignal;
}
