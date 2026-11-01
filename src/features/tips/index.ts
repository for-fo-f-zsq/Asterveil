import type { FeatureModule } from '../../core/module';
import { enhanceProblemActionTooltips } from '../../site/problem-actions';

export default {
  mount({ scope }) {
    enhanceProblemActionTooltips(scope);
  },
} satisfies FeatureModule;
