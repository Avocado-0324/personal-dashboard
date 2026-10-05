import type { UserSettings } from './module-types';

const DEFAULT_SETTINGS: UserSettings = {
  onboardingCompleted: false,
  modules: {
    'mail-todos': { enabled: true },
    'parenting-tips': { enabled: true },
    'github-activity': { enabled: true },
    'portfolio': { enabled: false },
  },
  config: {},
};

const SETTINGS_COOKIE_NAME = 'user_settings';

// 服务端：从 cookies() 读取设置
export function getUserSettingsFromCookie(cookieStore?: string): UserSettings {
  if (typeof window === 'undefined') {
    // 服务端：接收 cookie 字符串
    if (!cookieStore) return { ...DEFAULT_SETTINGS };
    
    try {
      const decoded = decodeURIComponent(cookieStore);
      return { ...DEFAULT_SETTINGS, ...JSON.parse(decoded) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  } else {
    // 客户端：从 document.cookie 读取
    const cookies = document.cookie.split(';');
    const settingsCookie = cookies.find(c => c.trim().startsWith(`${SETTINGS_COOKIE_NAME}=`));
    
    if (!settingsCookie) return { ...DEFAULT_SETTINGS };
    
    try {
      const value = settingsCookie.split('=')[1];
      const decoded = decodeURIComponent(value);
      return { ...DEFAULT_SETTINGS, ...JSON.parse(decoded) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

// 客户端：将设置写入 cookie
export function saveUserSettingsToCookie(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  
  const encoded = encodeURIComponent(JSON.stringify(settings));
  // 设置30天过期
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  document.cookie = `${SETTINGS_COOKIE_NAME}=${encoded}; path=/; expires=${expires.toUTCString()}`;
}

// 兼容旧接口（客户端使用）
export function getUserSettings(): UserSettings {
  return getUserSettingsFromCookie();
}

export function updateUserSettings(updates: Partial<UserSettings>): void {
  const current = getUserSettings();
  const updated = {
    ...current,
    ...updates,
    modules: {
      ...current.modules,
      ...(updates.modules || {}),
    },
    config: {
      ...current.config,
      ...(updates.config || {}),
    },
  };
  saveUserSettingsToCookie(updated);
}

export function toggleModule(moduleId: string, enabled: boolean): void {
  const current = getUserSettings();
  const updated = {
    ...current,
    modules: {
      ...current.modules,
      [moduleId]: { enabled },
    },
  };
  saveUserSettingsToCookie(updated);
}

export function resetSettings(): void {
  saveUserSettingsToCookie({ ...DEFAULT_SETTINGS });
}
