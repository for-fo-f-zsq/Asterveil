import type { FeatureModule } from '../../core/module';
import { enhanceContestReview } from '../../site/contest-review';

export default {
  mount({ scope, url }) {
    return enhanceContestReview(scope, url);
  },
} satisfies FeatureModule;
