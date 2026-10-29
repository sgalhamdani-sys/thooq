import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createEventStore(directory, initialEvents) {
  const file = join(directory, 'events.json');
  let pending = Promise.resolve();
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return structuredClone(initialEvents);
      throw new Error('تعذر قراءة البيانات المحفوظة. لم يتم استبدالها؛ راجعي ملف البيانات.', { cause: error });
    }
  }
  return {
    async read() { await pending; return read(); },
    update(change) {
      const operation = pending.then(async () => {
        const events = await read();
        const result = await change(events);
        await mkdir(directory, { recursive: true });
        const temporary = join(directory, `events-${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, JSON.stringify(events, null, 2), 'utf8');
          await rename(temporary, file);
        } finally { await unlink(temporary).catch(() => {}); }
        return result;
      });
      pending = operation.catch(() => {});
      return operation;
    }
  };
}
