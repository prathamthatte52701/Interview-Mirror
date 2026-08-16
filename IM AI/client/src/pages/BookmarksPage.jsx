import { useEffect, useState } from 'react';
import { Star, BookMarked } from 'lucide-react';
import { fetchBookmarks, toggleBookmark } from '../services/api.js';
import { showToast } from '../hooks/useToast.js';
import { formatDateTime, formatLabel } from '../lib/sessionFormat.js';

function BookmarkCard({ bookmark, onRemoved, onViewSession }) {
  const [removing, setRemoving] = useState(false);

  async function handleUnbookmark() {
    if (removing) return;
    setRemoving(true);
    try {
      await toggleBookmark(bookmark.sessionId, bookmark.questionIndex, false);
      onRemoved(bookmark.sessionId, bookmark.questionIndex);
    } catch {
      showToast('Could not remove bookmark. Please try again.', 'error');
      setRemoving(false);
    }
  }

  return (
    <div className="panel panel-sm history-answer-card bookmark-card">
      <div className="history-answer-card-title-row">
        <strong>{bookmark.question || 'Question not available'}</strong>
        <button
          type="button"
          className="bookmark-toggle active"
          onClick={handleUnbookmark}
          disabled={removing}
          aria-label="Remove bookmark"
        >
          <Star size={15} fill="currentColor" />
        </button>
      </div>
      <p>{bookmark.answer || 'User answer not available'}</p>
      <div className="bookmark-card-meta">
        <span>{formatLabel(bookmark.role)}</span>
        <span>{formatDateTime(bookmark.sessionCreatedAt)}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewSession(bookmark.sessionId)}>
          View full session
        </button>
      </div>
    </div>
  );
}

export default function BookmarksPage({ onViewSession }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBookmarks()
      .then((result) => {
        if (!cancelled) setBookmarks(Array.isArray(result) ? result : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load bookmarks.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleRemoved(sessionId, questionIndex) {
    setBookmarks((prev) => prev.filter((b) => !(b.sessionId === sessionId && b.questionIndex === questionIndex)));
  }

  return (
    <div className="anim-fade-up" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="setup-header">
        <div>
          <span className="setup-eyebrow"><BookMarked size={14} /> Saved questions</span>
          <h2>Bookmarks</h2>
          <p>Questions you starred from past sessions, all in one place.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : bookmarks.length === 0 ? (
        <div className="panel dashboard-empty-state history-empty-state">
          <BookMarked size={26} />
          <strong>No bookmarks yet.</strong>
          <span>Star a question from any past session's report to save it here.</span>
        </div>
      ) : (
        <div className="history-answer-list">
          {bookmarks.map((bookmark) => (
            <BookmarkCard
              key={`${bookmark.sessionId}-${bookmark.questionIndex}`}
              bookmark={bookmark}
              onRemoved={handleRemoved}
              onViewSession={onViewSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}
