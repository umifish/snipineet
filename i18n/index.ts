import { I18nManager } from './manager';
import { I18nConfig, I18nHooks } from './types';

let manager: I18nManager;

export function createMyI18n(config: I18nConfig) {
  manager = new I18nManager(config);
  return {
    install: async (app: any, hooks?: I18nHooks) => {
      await manager.init(app, hooks);
      // 挂载全局辅助函数
      app.config.globalProperties.$i18nHelper = manager.getHelper();
      app.provide('i18nManager', manager);
    }
  };
}

export { manager as i18nManager };