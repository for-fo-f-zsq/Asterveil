import type { FeatureModule } from '../../core/module';
import { enhanceAccountTables } from '../../site/account-tables';
import { appearancePage } from '../../site/appearance';
import { enhanceLogin } from '../../site/login';
import { enhancePlans } from '../../site/plans';
import { enhanceVjudgeAccounts } from '../../site/vjudge-accounts';

export default {
  mount({ scope, url }) {
    const page = appearancePage(url);
    if (page === 'login') return enhanceLogin(scope);
    if (page === 'account-vjudge') return enhanceVjudgeAccounts(scope);
    if (page === 'plans') return enhancePlans(scope);
    if (
      page === 'account' ||
      page === 'account-rankings' ||
      page === 'account-data' ||
      page === 'account-schedule'
    )
      enhanceAccountTables(scope);
  },
} satisfies FeatureModule;
