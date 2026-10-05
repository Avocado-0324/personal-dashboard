import { registerModule } from '@/lib/module-registry';
import { mailTodosModule } from './mail-todos';
import { parentingTipsModule } from './parenting-tips';
import { githubActivityModule } from './github-activity';
import { portfolioModule } from './portfolio';

export function initializeModules() {
  registerModule(mailTodosModule);
  registerModule(parentingTipsModule);
  registerModule(githubActivityModule);
  registerModule(portfolioModule);
}

export { mailTodosModule, parentingTipsModule, githubActivityModule, portfolioModule };
