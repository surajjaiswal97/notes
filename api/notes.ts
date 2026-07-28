import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataFile = process.env.NOTES_DATA_FILE ?? (process.env.VERCEL ? '/tmp/notes.json' : path.resolve(process.cwd(), 'data/notes.json'));

async function ensureDataFile() {
  const dir = path.dirname(dataFile);
  await mkdir(dir, { recursive: true });
  try {
    await readFile(dataFile, 'utf8');
  } catch {
    await writeFile(dataFile, '[]', 'utf8');
  }
}

async function readNotes() {
  await ensureDataFile();
  const raw = await readFile(dataFile, 'utf8');
  return JSON.parse(raw || '[]');
}

export default async function handler(req: { method: string; url?: string; body?: any; query?: Record<string, unknown> }, res: { status: (code: number) => any; json: (body: any) => any; setHeader?: (name: string, value: string) => void; end?: (body?: string) => any; }) {
  res.setHeader?.('Content-Type', 'application/json');

  const url = new URL(req.url ?? '/', 'https://notes-sage-mu.vercel.app');
  const pathname = url.pathname.replace(/^\/api/, '') || '/';

  if (req.method === 'GET' && pathname === '/health') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method === 'GET' && pathname === '/notes') {
    const notes = await readNotes();
    return res.status(200).json({ notes, total: notes.length, page: 1, limit: notes.length });
  }

  if (req.method === 'POST' && pathname === '/notes') {
    const body = req.body ?? {};
    const note = {
      id: `${Date.now()}`,
      title: body.title ?? 'Untitled note',
      content: body.content ?? 'Start writing...',
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const notes = await readNotes();
    notes.unshift(note);
    await writeFile(dataFile, JSON.stringify(notes, null, 2), 'utf8');
    return res.status(201).json(note);
  }

  if (req.method === 'GET' && pathname === '/tags') {
    const notes = await readNotes();
    const counts = new Map<string, number>();
    notes.forEach((note: { tags: string[] }) => {
      note.tags.forEach((tag: string) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    });
    return res.status(200).json(Array.from(counts.entries()).map(([name, count]) => ({ name, count })));
  }

  return res.status(404).json({ error: { message: 'Not found' } });
}
