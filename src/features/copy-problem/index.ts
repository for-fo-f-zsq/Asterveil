import type { FeatureModule } from '../../core/module';
import { enhanceProblemSource } from '../../site/problem-source';
import { enhanceProblemTitle } from '../../site/problem-title';

export default {
  mount({ scope, url }) {
    enhanceProblemSource(scope, url);
    enhanceProblemTitle(scope);
  },
} satisfies FeatureModule;
