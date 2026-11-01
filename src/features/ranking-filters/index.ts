import type { FeatureModule } from '../../core/module';
import { enhanceRankingFilters } from '../../site/ranking-filters';

export default {
  mount({ scope, url }) {
    enhanceRankingFilters(scope, url);
  },
} satisfies FeatureModule;
