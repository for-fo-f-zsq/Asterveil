import type { ModuleId } from '../shared/catalog';
import type { Settings } from '../shared/settings';
import type { TargetSite } from '../site/target';
import type { Scope } from './scope';

export interface ModuleContext {
  readonly url: URL;
  readonly site: TargetSite;
  readonly scope: Scope;
  readonly settings: Settings;
}

export interface FeatureModule {
  mount(context: ModuleContext): void | Promise<void>;
}

export interface ModuleDefinition {
  readonly id: ModuleId;
  readonly configurationKey?: (settings: Settings) => string;
  /** Feature switches that live inside another module follow their master switch. */
  readonly enabled?: (settings: Settings) => boolean;
  readonly matches: (url: URL) => boolean;
  readonly load: () => Promise<FeatureModule>;
}
