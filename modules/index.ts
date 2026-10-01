import { registerModule } from '@/lib/module-registry';
import { mailTodosModule } from './mail-todos';
import { parentingTipsModule } from './parenting-tips';
import { githubActivityModule } from './github-activity';

export function initializeModules() {
  registerModule(mailTodosModule);
  registerModule(parentingTipsModule);
  registerModule(githubActivityModule);
}

export { mailTodosModule, parentingTipsModule, githubActivityModule };
