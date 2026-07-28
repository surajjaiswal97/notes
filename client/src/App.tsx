import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type Tag = {
  name: string;
  count: number;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:3000');

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.localStorage.getItem('notes-theme') === 'dark' ? 'dark' : 'light';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(error.error?.message ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sort, setSort] = useState('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', content: '', tags: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const saveTimer = useRef<number | null>(null);
  const skipNextSaveRef = useRef(false);
  const lastSelectedNoteIdRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId) ?? null, [notes, selectedId]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const payload = await request<{ notes: Note[]; total: number }>('/notes?search=' + encodeURIComponent(search) + '&tag=' + encodeURIComponent(selectedTag) + '&sort=' + sort + '&order=' + order + '&page=1&limit=50');
      setNotes(payload.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotes();
    void request<Tag[]>('/tags').then(setTags).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('notes-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    const handleKeydown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (isMod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openCreateDialog();
      }
      if (event.key === 'Delete' && selectedNote) {
        event.preventDefault();
        confirmDelete(selectedNote.id);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [selectedNote]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      void loadNotes();
    }, 300);
    return () => window.clearTimeout(handler);
  }, [search, selectedTag, sort, order]);

  useEffect(() => {
    if (!selectedNote) {
      lastSelectedNoteIdRef.current = null;
      return;
    }

    if (lastSelectedNoteIdRef.current !== selectedNote.id) {
      lastSelectedNoteIdRef.current = selectedNote.id;
      setDraft({
        title: selectedNote.title,
        content: selectedNote.content,
        tags: selectedNote.tags.join(', ')
      });
      skipNextSaveRef.current = true;
    }
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }

    const currentDraft = {
      title: draft.title || 'Untitled',
      content: draft.content,
      tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    };

    const previousDraftRef = saveTimer.current;
    if (previousDraftRef) {
      window.clearTimeout(previousDraftRef);
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    const snapshot = JSON.stringify(currentDraft);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        const optimisticNote = { ...selectedNote, ...currentDraft };
        setNotes((current) => current.map((note) => (note.id === selectedNote.id ? optimisticNote : note)));
        const saved = await request<Note>(`/notes/${selectedNote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: optimisticNote.title, content: optimisticNote.content, tags: optimisticNote.tags })
        });
        setNotes((current) => current.map((note) => (note.id === selectedNote.id ? { ...note, ...saved } : note)));
        lastSavedSnapshotRef.current = snapshot;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }, 400);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [draft, selectedNote]);

  const openCreateDialog = () => {
    setDialogMode('create');
    setDraft({ title: '', content: '', tags: '' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (id: string) => {
    const note = notes.find((item) => item.id === id);
    if (!note) {
      return;
    }
    setDialogMode('edit');
    setSelectedId(id);
    setDraft({ title: note.title, content: note.content, tags: note.tags.join(', ') });
    setIsDialogOpen(true);
  };

  const saveDraft = async () => {
    if (!selectedId && dialogMode === 'edit') {
      return;
    }

    try {
      const payload = {
        title: draft.title.trim() || 'Untitled note',
        content: draft.content.trim() || 'Start writing...',
        tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      };

      if (dialogMode === 'create') {
        const created = await request<Note>('/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        setNotes((current) => [created, ...current]);
        setSelectedId(created.id);
        setError(null);
      } else {
        const note = notes.find((item) => item.id === selectedId);
        if (!note) {
          return;
        }
        const updated = await request<Note>(`/notes/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        setNotes((current) => current.map((item) => (item.id === selectedId ? updated : item)));
        setError(null);
      }

      setIsDialogOpen(false);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save note');
    }
  };

  const confirmDelete = (id: string) => {
    setPendingDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const deleteNote = async () => {
    if (!pendingDeleteId) {
      return;
    }

    try {
      await request(`/notes/${pendingDeleteId}`, { method: 'DELETE' });
      setNotes((current) => current.filter((note) => note.id !== pendingDeleteId));
      if (selectedId === pendingDeleteId) {
        setSelectedId(null);
      }
      setPendingDeleteId(null);
      setIsDeleteDialogOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete note');
    }
  };

  const resetView = () => {
    setSearch('');
    setSelectedTag('');
  };

  return (
    <div className="min-h-screen bg-transparent px-4 py-6 text-slate-900 transition-colors dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-500">Notes Studio</p>
              <h1 className="text-3xl font-semibold">Write, organize, and revisit your ideas</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">Create notes, add tags, and preview markdown in a clean workspace designed for flow.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
              <button onClick={openCreateDialog} className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700">
                + New note
              </button>
              <button onClick={resetView} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Reset filters
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70" aria-label="Note controls">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Search</span>
              <input ref={searchInputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none ring-0 transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Tag</span>
              <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800">
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name} ({tag.count})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800">
                <option value="updatedAt">Updated</option>
                <option value="createdAt">Created</option>
                <option value="title">Title</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Order</span>
              <select value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800">
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div> : null}
        {offline ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">Offline mode: changes will be saved when connection is restored.</div> : null}

        <main className="grid gap-6">
          <aside className="rounded-3xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70">
            {loading ? <p className="text-sm text-slate-500">Loading notes…</p> : null}
            {!loading && notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet. Create one to get started.</p> : null}
            <div className="mt-3 flex flex-col gap-3">
              {notes.map((note) => (
                <article key={note.id} className={`cursor-pointer rounded-2xl border p-4 transition ${selectedId === note.id ? 'border-indigo-400 bg-indigo-50 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/40' : 'border-slate-200 bg-slate-50/70 hover:border-indigo-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/60'}`} onClick={() => openEditDialog(note.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{note.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{note.content.slice(0, 80)}</p>
                    </div>
                    <button onClick={(event) => { event.stopPropagation(); confirmDelete(note.id); }} aria-label={`Delete ${note.title}`} className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40">
                      Delete
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">{note.tags.join(', ') || 'No tags'}</div>
                </article>
              ))}
            </div>
          </aside>

          {/* <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70">
            {selectedNote ? (
              <div className="flex h-full min-h-[320px] flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 dark:border-slate-700 dark:bg-slate-800/40">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-500">Editor dialog</p>
                  <h2 className="mt-3 text-xl font-semibold">{selectedNote.title}</h2>
                  <p className="mt-2 text-sm text-slate-500">Opening the note now shows the same editor dialog with your current content prefilled.</p>
                </div>
                <button onClick={() => openEditDialog(selectedNote.id)} className="mt-6 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
                  Open editor
                </button>
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 text-center dark:border-slate-700 dark:bg-slate-800/40">
                <h2 className="text-lg font-semibold">Select a note</h2>
                <p className="mt-2 max-w-md text-sm text-slate-500">Create a note or pick one from the list to start editing.</p>
              </div>
            )}
          </section> */}
        </main>

        {isDialogOpen ? (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setIsDialogOpen(false)}>
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">{dialogMode === 'create' ? 'New note' : 'Edit note'}</h3>
                <button onClick={() => setIsDialogOpen(false)} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">Close</button>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>Title</span>
                  <input value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>Tags</span>
                  <input value={draft.tags} onChange={(e) => setDraft((current) => ({ ...current, tags: e.target.value }))} placeholder="tag1, tag2" className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span>Content</span>
                  <textarea value={draft.content} onChange={(e) => setDraft((current) => ({ ...current, content: e.target.value }))} rows={12} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800" />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200" onClick={() => setIsDialogOpen(false)}>Cancel</button>
                <button className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700" onClick={() => void saveDraft()}>{dialogMode === 'create' ? 'Create note' : 'Save changes'}</button>
              </div>
            </div>
          </div>
        ) : null}

        {isDeleteDialogOpen ? (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setIsDeleteDialogOpen(false)}>
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
              <h3 className="text-xl font-semibold">Delete note?</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This action cannot be undone. Delete this note permanently?</p>
              <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</button>
                <button className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700" onClick={() => void deleteNote()}>Delete</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
