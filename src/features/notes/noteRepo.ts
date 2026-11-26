import { getDb } from "../../lib/db";
import type { Note, NoteWithArticle } from "../../types";

interface NoteRow {
  id: string;
  article_id: string;
  quote: string;
  created_at: number;
  article_title: string;
  feed_title: string;
  article_published_at: number;
}

const SELECT_WITH_ARTICLE = `
  SELECT n.*, a.title AS article_title, f.title AS feed_title,
         a.published_at AS article_published_at
  FROM notes n
  JOIN articles a ON a.id = n.article_id
  JOIN feeds f ON f.id = a.feed_id
`;

function toNote(row: NoteRow): NoteWithArticle {
  return {
    id: row.id,
    articleId: row.article_id,
    quote: row.quote,
    createdAt: row.created_at,
    articleTitle: row.article_title,
    feedTitle: row.feed_title,
    articlePublishedAt: row.article_published_at,
  };
}

export async function listNotes(): Promise<NoteWithArticle[]> {
  const db = await getDb();
  const rows = await db.select<NoteRow[]>(
    `${SELECT_WITH_ARTICLE} ORDER BY n.created_at DESC`,
  );
  return rows.map(toNote);
}

export async function insertNote(note: Note): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO notes (id, article_id, quote, created_at) VALUES (?, ?, ?, ?)",
    [note.id, note.articleId, note.quote, note.createdAt],
  );
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = ?", [id]);
}
