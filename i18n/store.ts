export interface IStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl: number): Promise<void>;
}

export class IndexedDBProvider implements IStorage {
  private dbName = 'I18N_CACHE';
  private storeName = 'messages';

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string) {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const request = transaction.objectStore(this.storeName).get(key);
      request.onsuccess = () => {
        const res = request.result;
        if (res && res.expiry > Date.now()) resolve(res.value);
        else resolve(null);
      };
    });
  }

  async set(key: string, value: any, ttl: number) {
    const db = await this.getDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    transaction.objectStore(this.storeName).put({
      value,
      expiry: Date.now() + ttl
    }, key);
  }
}

export class LocalStorageProvider implements IStorage {
  async get(key: string) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (item.expiry < Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: any, ttl: number) {
    localStorage.setItem(key, JSON.stringify({ value, expiry: Date.now() + ttl }));
  }
}