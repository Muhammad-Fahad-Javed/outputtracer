"use client";

import { useState } from "react";
import { X, Plus, Trash2, CheckCircle2, Circle, ListTodo, FileText } from "lucide-react";
import { useSharedNotes } from "@/hooks/useSharedNotes";
import { formatDayDivider } from "@/lib/format";

interface SharedNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  userId: string | null;
}

export function SharedNotesPanel({ isOpen, onClose, conversationId, userId }: SharedNotesPanelProps) {
  const { notes, loading, addNote, toggleTodo, deleteNote } = useSharedNotes(conversationId);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isTodo, setIsTodo] = useState(false);

  if (!isOpen) return null;

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !userId) return;
    
    await addNote(newTitle.trim(), newContent.trim() || null, isTodo, userId);
    setNewTitle("");
    setNewContent("");
    setIsTodo(false);
    setIsAdding(false);
  }

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm flex-col border-l border-black/5 bg-background shadow-2xl transition-transform sm:w-96 flex animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-4">
          <h2 className="text-lg font-bold text-ink">Shared Notes</h2>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-muted hover:bg-black/5 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-sm text-muted">Loading...</p>
          ) : notes.length === 0 && !isAdding ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted">
              <FileText className="mb-2 h-8 w-8 opacity-20" />
              <p className="text-sm">No shared notes yet.</p>
              <p className="text-xs">Create a list or note together.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {notes.map(note => (
                <div key={note.id} className="group relative rounded-2xl border border-black/5 bg-card p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    {note.is_todo && (
                      <button 
                        onClick={() => toggleTodo(note.id, !note.is_completed)}
                        className="mt-0.5 shrink-0 text-muted hover:text-primary"
                      >
                        {note.is_completed ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>
                    )}
                    <div className="flex-1 overflow-hidden">
                      <h3 className={`text-sm font-semibold text-ink ${note.is_todo && note.is_completed ? "line-through opacity-50" : ""}`}>
                        {note.title}
                      </h3>
                      {note.content && (
                        <p className={`mt-1 whitespace-pre-wrap text-xs text-muted ${note.is_todo && note.is_completed ? "opacity-50" : ""}`}>
                          {note.content}
                        </p>
                      )}
                      <p className="mt-2 text-[10px] text-muted/60">
                        {formatDayDivider(note.created_at)}
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => deleteNote(note.id)}
                    className="absolute right-2 top-2 rounded-full p-1.5 text-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-black/5 bg-card p-4">
          {isAdding ? (
            <form onSubmit={handleAddNote} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsTodo(false)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition ${!isTodo ? "bg-primary text-white" : "bg-black/5 text-muted hover:text-ink"}`}
                >
                  <FileText className="h-4 w-4" /> Note
                </button>
                <button
                  type="button"
                  onClick={() => setIsTodo(true)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition ${isTodo ? "bg-primary text-white" : "bg-black/5 text-muted hover:text-ink"}`}
                >
                  <ListTodo className="h-4 w-4" /> To-Do
                </button>
              </div>
              
              <input 
                type="text"
                placeholder={isTodo ? "Task title..." : "Note title..."}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                autoFocus
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              
              <textarea 
                placeholder="Details (optional)..."
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={3}
                className="resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setNewTitle("");
                    setNewContent("");
                  }}
                  className="flex-1 rounded-xl bg-black/5 py-2 text-sm font-medium text-muted hover:bg-black/10 hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-white transition hover:bg-primary-dark shadow-sm hover:shadow"
            >
              <Plus className="h-5 w-5" /> Add Note or To-Do
            </button>
          )}
        </div>
      </div>
    </>
  );
}
