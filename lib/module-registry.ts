import type { ModuleContract, ModuleId } from './module-types';

const modules: Map<ModuleId, ModuleContract> = new Map();

export function registerModule(module: ModuleContract) {
  modules.set(module.manifest.id, module);
}

export function getModule(id: ModuleId): ModuleContract | undefined {
  return modules.get(id);
}

export function getAllModules(): ModuleContract[] {
  return Array.from(modules.values()).sort(
    (a, b) => a.manifest.layout.priority - b.manifest.layout.priority
  );
}

export function getEnabledModules(
  userSettings: { modules: Record<string, { enabled: boolean }> }
): ModuleContract[] {
  return getAllModules().filter((module) => {
    const userPref = userSettings.modules[module.manifest.id];
    // 如果用户有设置，用用户设置；否则用 manifest.defaultEnabled
    if (userPref !== undefined) {
      return userPref.enabled;
    }
    return module.manifest.defaultEnabled;
  });
}
