import type { FeatureModule } from '../../core/module';
import { enhanceSubmissionCode } from '../../site/submission-code';

export default {
  mount({ scope }) {
    enhanceSubmissionCode(scope);
  },
} satisfies FeatureModule;
