import { DateTimeFormats, NumberFormats } from 'vue-i18n';

export type StorageType = 'memory' | 'localStorage' | 'indexedDB';

export interface I18nConfig {
  defaultLocale: string;
  fallbackLocale: string;
  endpoints: {
    list: string; // 获取语言列表接口
    message: (locale: string, ns: string) => string; // 获取特定语言包接口
  };
  storage: {
    type: StorageType;
    keyPrefix: string;
    maxAge: number; // 缓存有效期
    quota?: number; // 存储上限控制
  };
  adapters?: {
    localeList?: (data: any) => string[];
    message?: (data: any) => Record<string, any>;
  };
  datetimeFormats?: DateTimeFormats;
  numberFormats?: NumberFormats;
}

export interface I18nHooks {
  beforeLoad?: (locale: string, ns: string) => void;
  afterLoad?: (locale: string, ns: string) => void;
  onLoadError?: (error: any, locale: string) => void;
}