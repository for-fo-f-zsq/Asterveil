import type { FeatureModule } from '../../core/module';

export default {
  mount({ scope }) {
    return import('../../site/chat-markdown').then(({ enhanceChatMarkdown }) => {
      if (!scope.signal.aborted) enhanceChatMarkdown(scope);
    });
  },
} satisfies FeatureModule;
