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
  const saveTimer = useRef<number | null>(null);
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
        void createNote();
      }
      if (event.key === 'Delete' && selectedNote) {
        event.preventDefault();
        void deleteNote(selectedNote.id);
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
      return;
    }
    setDraft({
      title: selectedNote.title,
      content: selectedNote.content,
      tags: selectedNote.tags.join(', ')
    });
  }, [selectedNote]);

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

    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        const optimisticNote = { ...selectedNote, ...currentDraft };
        setNotes((current) => current.map((note) => (note.id === selectedNote.id ? optimisticNote : note)));
        await request<Note>(`/notes/${selectedNote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: optimisticNote.title, content: optimisticNote.content, tags: optimisticNote.tags })
        });
        await loadNotes();
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

  const createNote = async () => {
    try {
      const created = await request<Note>('/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled note', content: 'Start writing...', tags: [] })
      });
      setNotes((current) => [created, ...current]);
      setSelectedId(created.id);
      setDraft({ title: created.title, content: created.content, tags: created.tags.join(', ') });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create note');
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await request(`/notes/${id}`, { method: 'DELETE' });
      setNotes((current) => current.filter((note) => note.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
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
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Notes Studio</h1>
          <p>Fast, searchable notes with markdown and tags.</p>
        </div>
        <div className="topbar-actions">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="ghost">
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button onClick={createNote}>New note</button>
          <button className="ghost" onClick={resetView}>Reset filters</button>
        </div>
      </header>

      <section className="toolbar" aria-label="Note controls">
        <label>
          Search
          <input ref={searchInputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" />
        </label>
        <label>
          Tag
          <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name} ({tag.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updatedAt">Updated</option>
            <option value="createdAt">Created</option>
            <option value="title">Title</option>
          </select>
        </label>
        <label>
          Order
          <select value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </section>

      {error ? <div className="status error">{error}</div> : null}
      {offline ? <div className="status warning">Offline mode: changes will be saved when connection is restored.</div> : null}

      <main className="content-grid">
        <aside className="sidebar">
          {loading ? <p>Loading notes…</p> : null}
          {!loading && notes.length === 0 ? <p className="empty">No notes yet. Create one to get started.</p> : null}
          {notes.map((note) => (
            <article key={note.id} className={`note-card ${selectedId === note.id ? 'active' : ''}`} onClick={() => setSelectedId(note.id)}>
              <div className="note-card-header">
                <strong>{note.title}</strong>
                <button onClick={(event) => { event.stopPropagation(); void deleteNote(note.id); }} aria-label={`Delete ${note.title}`}>
                  Delete
                </button>
              </div>
              <p>{note.content.slice(0, 80)}</p>
              <div className="meta">{note.tags.join(', ') || 'No tags'}</div>
            </article>
          ))}
        </aside>

        <section className="editor-panel">
          {selectedNote ? (
            <>
              <div className="editor-header">
                <div>
                  <h2>{selectedNote.title}</h2>
                  <p>Last updated {formatDate(selectedNote.updatedAt)}</p>
                </div>
                <span className="saving-badge">{saving ? 'Saving…' : 'Saved'}</span>
              </div>
              <label>
                Title
                <input value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} />
              </label>
              <label>
                Tags
                <input value={draft.tags} onChange={(e) => setDraft((current) => ({ ...current, tags: e.target.value }))} placeholder="tag1, tag2" />
              </label>
              <label>
                Content
                <textarea value={draft.content} onChange={(e) => setDraft((current) => ({ ...current, content: e.target.value }))} rows={12} />
              </label>
              <div className="preview" dangerouslySetInnerHTML={{ __html: marked.parse(draft.content) as string }} />
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a note</h2>
              <p>Create a note or pick one from the list to start editing.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
