import { readBackup } from "../domain/backup";
import type { ProjectDraft } from "../domain/model";

let database: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("mako-lrc-studio", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("本机草稿存储被另一个页面阻塞。"));
    });
  return database;
}
export async function loadDraft(): Promise<ProjectDraft | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", "readonly");
    const request = transaction.objectStore("drafts").get("current");
    request.onsuccess = () => {
      try {
        resolve(
          request.result ? readBackup(JSON.stringify(request.result)) : null,
        );
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
export async function saveDraft(project: ProjectDraft): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    transaction
      .objectStore("drafts")
      .put(JSON.parse(JSON.stringify(project)), "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
