import type { ModuleContract } from '@/lib/module-types';
import { manifest } from './manifest';
import { load } from './server';
import { Card } from './ui';

export const mailTodosModule: ModuleContract = {
  manifest,
  load,
  Card,
};
