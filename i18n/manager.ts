import { createI18n, type I18n } from 'vue-i18n';
import { I18nConfig, I18nHooks } from './types';
import { IndexedDBProvider, LocalStorageProvider, IStorage } from './storage';

export class I18nManager {
  public i18n!: I18n;
  private storage!: IStorage;
  private loadedMap: Map<string, Set<string>> = new Map();
  private hooks: I18nHooks = {};
  private syncChannel = new BroadcastChannel('i18n_sync');

  constructor(private config: I18nConfig) {
    this.storage = config.storage.type === 'indexedDB' 
      ? new IndexedDBProvider() 
      : new LocalStorageProvider();
  }

  // 初始化方法
  async init(app: any, hooks?: I18nHooks) {
    this.hooks = hooks || {};
    
    // 1. 获取支持列表
    const locales = await this.fetchLocales();
    
    // 2. 检测初始语言 (缓存 -> 浏览器 -> 默认)
    const initialLocale = await this.detectLocale(locales);

    // 3. 创建 i18n 实例
    this.i18n = createI18n({
      legacy: false,
      locale: initialLocale,
      fallbackLocale: this.config.fallbackLocale,
      datetimeFormats: this.config.datetimeFormats,
      numberFormats: this.config.numberFormats,
      messages: {}
    });

    // 4. 加载首屏文案包
    await this.loadNamespace(initialLocale, 'common');
    
    app.use(this.i18n);
    this.setupSync();
  }

  /**
   * 按需加载命名空间
   */
  async loadNamespace(locale: string, ns: string): Promise<boolean> {
    const cacheKey = `${this.config.storage.keyPrefix}_${locale}_${ns}`;
    
    if (this.loadedMap.get(locale)?.has(ns)) return true;

    try {
      this.hooks.beforeLoad?.(locale, ns);

      // a. 读缓存
      let msgs = await this.storage.get(cacheKey);

      // b. 网络加载（带重试机制）
      if (!msgs) {
        msgs = await this.fetchWithRetry(this.config.endpoints.message(locale, ns));
        if (this.config.adapters?.message) msgs = this.config.adapters.message(msgs);
        await this.storage.set(cacheKey, msgs, this.config.storage.maxAge);
      }

      // c. 合并文案
      this.i18n.global.mergeLocaleMessage(locale, msgs);
      
      if (!this.loadedMap.has(locale)) this.loadedMap.set(locale, new Set());
      this.loadedMap.get(locale)!.add(ns);
      
      this.hooks.afterLoad?.(locale, ns);
      return true;
    } catch (error) {
      this.hooks.onLoadError?.(error, locale);
      return false;
    }
  }

  /**
   * 切换语言 (无感切换 + 回滚)
   */
  async switchLanguage(newLocale: string) {
    const oldLocale = this.i18n.global.locale.value;
    if (newLocale === oldLocale) return;

    // 先加载新语言的 common 包
    const success = await this.loadNamespace(newLocale, 'common');

    if (success) {
      this.i18n.global.locale.value = newLocale;
      this.storage.set('user_lang', newLocale, 31536000000); // 持久化选择
      this.syncChannel.postMessage({ type: 'LOCALE_UPDATE', locale: newLocale });
      document.documentElement.lang = newLocale;
    } else {
      // 失败则不进行 locale 赋值，即实现回滚
      console.error(`[I18n] Failed to switch to ${newLocale}, keep ${oldLocale}`);
    }
  }

  // --- 内部辅助 ---
  private async fetchLocales(): Promise<string[]> {
    const res = await fetch(this.config.endpoints.list);
    const data = await res.json();
    return this.config.adapters?.localeList ? this.config.adapters.localeList(data) : data;
  }

  private async detectLocale(supported: string[]): Promise<string> {
    const cached = await this.storage.get('user_lang');
    if (cached && supported.includes(cached)) return cached;
    const browser = navigator.language;
    return supported.includes(browser) ? browser : this.config.defaultLocale;
  }

  private async fetchWithRetry(url: string, retries = 2): Promise<any> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return await res.json();
    } catch (e) {
      if (retries > 0) return this.fetchWithRetry(url, retries - 1);
      throw e;
    }
  }

  private setupSync() {
    this.syncChannel.onmessage = (e) => {
      if (e.data.type === 'LOCALE_UPDATE') this.i18n.global.locale.value = e.data.locale;
    };
  }

  // 暴露给 Vue 模板的辅助工具
  public getHelper() {
    return {
      t: this.i18n.global.t,
      n: this.i18n.global.n,
      d: this.i18n.global.d,
      current: () => this.i18n.global.locale.value,
      timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
}