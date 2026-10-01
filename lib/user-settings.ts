import type { UserSettings } from './module-types';

const DEFAULT_SETTINGS: UserSettings = {
  onboardingCompleted: false,
  modules: {
    'mail-todos': { enabled: true },
    'parenting-tips': { enabled: true },
    'github-activity': { enabled: true },
  },
  config: {},
};

// M0: 简单的内存存储，后续可改为持久化
let currentSettings: UserSettings = { ...DEFAULT_SETTINGS };

export function getUserSettings(): UserSettings {
  return currentSettings;
}

export function updateUserSettings(updates: Partial<UserSettings>): void {
  currentSettings = {
    ...currentSettings,
    ...updates,
    modules: {
      ...currentSettings.modules,
      ...(updates.modules || {}),
    },
    config: {
      ...currentSettings.config,
      ...(updates.config || {}),
    },
  };
}

export function toggleModule(moduleId: string, enabled: boolean): void {
  currentSettings = {
    ...currentSettings,
    modules: {
      ...currentSettings.modules,
      [moduleId]: { enabled },
    },
  };
}

export function resetSettings(): void {
  currentSettings = { ...DEFAULT_SETTINGS };
}
