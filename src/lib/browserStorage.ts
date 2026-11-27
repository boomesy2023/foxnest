const DATABASE_NAME = "foxnest-browser";
const STORE_NAME = "keyval";
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error("无法打开浏览器存储"));
      };
    });
  }
  return databasePromise;
}

export async function readBrowserValue<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("读取浏览器存储失败"));
  });
}

export async function writeBrowserValue<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("写入浏览器存储失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("写入浏览器存储被中止"));
  });
}

export async function deleteBrowserValue(key: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("删除浏览器存储失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("删除浏览器存储被中止"));
  });
}
