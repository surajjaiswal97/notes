import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

const notesSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140, 'Title must be at most 140 characters'),
  content: z.string().trim().min(1, 'Content is required'),
  tags: z.array(z.string().trim().min(1).max(30)).default([])
});

const updateSchema = notesSchema.partial();

const dataFile = process.env.NOTES_DATA_FILE ?? (process.env.VERCEL ? '/tmp/notes.json' : path.resolve(process.cwd(), 'data/notes.json'));

async function ensureDataFile() {
  await mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await readFile(dataFile, 'utf8');
  } catch {
    await writeFile(dataFile, '[]', 'utf8');
  }
}

async function readNotes(): Promise<Note[]> {
  await ensureDataFile();
  const raw = await readFile(dataFile, 'utf8');
  return JSON.parse(raw) as Note[];
}

async function writeNotes(notes: Note[]) {
  await ensureDataFile();
  await writeFile(dataFile, JSON.stringify(notes, null, 2), 'utf8');
}

function normalizeTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function sendError(res: Response, status: number, message: string, details?: unknown) {
  res.status(status).json({ error: { message, details } });
}

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/notes', async (req, res) => {
    try {
      const notes = await readNotes();
      const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase() : '';
      const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updatedAt';
      const order = typeof req.query.order === 'string' && req.query.order === 'asc' ? 'asc' : 'desc';
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);

      const filtered = notes
        .filter((note) => {
          const matchesSearch = !search || `${note.title} ${note.content}`.toLowerCase().includes(search);
          const matchesTag = !tag || note.tags.includes(tag);
          return matchesSearch && matchesTag;
        })
        .sort((a, b) => {
          const dir = order === 'asc' ? 1 : -1;
          const left = a[sort as keyof Note] as string;
          const right = b[sort as keyof Note] as string;
          return left.localeCompare(right) * dir;
        });

      const start = (page - 1) * limit;
      const pagedNotes = filtered.slice(start, start + limit);
      res.json({ notes: pagedNotes, total: filtered.length, page, limit });
    } catch (error) {
      sendError(res, 500, 'Unable to list notes', error);
    }
  });

  app.get('/notes/:id', async (req, res) => {
    try {
      const notes = await readNotes();
      const note = notes.find((item) => item.id === req.params.id);
      if (!note) {
        return sendError(res, 404, 'Note not found');
      }
      return res.json(note);
    } catch (error) {
      return sendError(res, 500, 'Unable to fetch note', error);
    }
  });

  app.post('/notes', async (req, res) => {
    try {
      const parsed = notesSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Validation failed', parsed.error.flatten().fieldErrors);
      }

      const now = new Date().toISOString();
      const notes = await readNotes();
      const note: Note = {
        id: randomUUID(),
        title: parsed.data.title,
        content: parsed.data.content,
        tags: normalizeTags(parsed.data.tags),
        createdAt: now,
        updatedAt: now
      };
      notes.unshift(note);
      await writeNotes(notes);
      return res.status(201).json(note);
    } catch (error) {
      return sendError(res, 500, 'Unable to create note', error);
    }
  });

  app.patch('/notes/:id', async (req, res) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Validation failed', parsed.error.flatten().fieldErrors);
      }

      const notes = await readNotes();
      const index = notes.findIndex((item) => item.id === req.params.id);
      if (index === -1) {
        return sendError(res, 404, 'Note not found');
      }

      const updated: Note = {
        ...notes[index],
        ...parsed.data,
        tags: parsed.data.tags ? normalizeTags(parsed.data.tags) : notes[index].tags,
        updatedAt: new Date().toISOString()
      };
      notes[index] = updated;
      await writeNotes(notes);
      return res.json(updated);
    } catch (error) {
      return sendError(res, 500, 'Unable to update note', error);
    }
  });

  app.delete('/notes/:id', async (req, res) => {
    try {
      const notes = await readNotes();
      const index = notes.findIndex((item) => item.id === req.params.id);
      if (index === -1) {
        return sendError(res, 404, 'Note not found');
      }
      notes.splice(index, 1);
      await writeNotes(notes);
      return res.json({ success: true });
    } catch (error) {
      return sendError(res, 500, 'Unable to delete note', error);
    }
  });

  app.get('/tags', async (_req, res) => {
    try {
      const notes = await readNotes();
      const counts = new Map<string, number>();
      notes.forEach((note) => {
        note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
      });
      const tags = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.json(tags);
    } catch (error) {
      return sendError(res, 500, 'Unable to fetch tags', error);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    sendError(res, 500, 'Unexpected server error');
  });

  return app;
}

export const app = createApp();
