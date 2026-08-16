import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSession, deleteSession as deleteSessionRequest, toggleBookmark as toggleBookmarkRequest } from '../services/api.js';

const SESSION_GROUP_SIZE = 10;

export function groupSessions(sessions = [], size = SESSION_GROUP_SIZE) {
  if (!sessions.length) return [];

  const groups = [];
  for (let index = 0; index < sessions.length; index += size) {
    const start = index + 1;
    const end = Math.min(index + size, sessions.length);
    groups.push({
      key: `sessions-${start}-${end}`,
      start,
      end,
      items: sessions.slice(index, end)
    });
  }
  return groups;
}

export function useSessionHistory(history = [], loading = false, onDeleted, initialSelectedId = '') {
  const [sessions, setSessions] = useState(history);
  const [selectedId, setSelectedId] = useState(initialSelectedId || history[0]?.id || '');
  const [transcriptCache, setTranscriptCache] = useState({});
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  useEffect(() => {
    setSessions(history);
  }, [history]);

  useEffect(() => {
    if (!sessions.length) {
      setSelectedId('');
      return;
    }
    setSelectedId((current) => (sessions.some((s) => s.id === current) ? current : sessions[0].id));
  }, [sessions]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) || null,
    [sessions, selectedId]
  );

  useEffect(() => {
    const id = selectedSession?.id;
    if (!id || transcriptCache[id]) return undefined;

    let cancelled = false;
    setTranscriptLoading(true);
    fetchSession(id)
      .then((full) => {
        if (cancelled) return;
        setTranscriptCache((prev) => ({ ...prev, [id]: full?.transcript || [] }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTranscriptLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSession?.id, transcriptCache]);

  const selectedTranscript = selectedSession ? (transcriptCache[selectedSession.id] || null) : null;

  const deleteSession = useCallback(async (id) => {
    await deleteSessionRequest(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setTranscriptCache((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    onDeleted?.(id);
  }, [onDeleted]);

  const toggleBookmark = useCallback(async (sessionId, questionIndex, bookmarked) => {
    function setEntryBookmarked(value) {
      setTranscriptCache((prev) => {
        const current = prev[sessionId];
        if (!current) return prev;
        return {
          ...prev,
          [sessionId]: current.map((entry, i) => (i === questionIndex ? { ...entry, bookmarked: value } : entry))
        };
      });
    }

    setEntryBookmarked(bookmarked);
    try {
      await toggleBookmarkRequest(sessionId, questionIndex, bookmarked);
    } catch (err) {
      setEntryBookmarked(!bookmarked);
      throw err;
    }
  }, []);

  return {
    sessions,
    selectedId,
    selectSession: setSelectedId,
    selectedSession,
    selectedTranscript,
    transcriptLoading: transcriptLoading && !selectedTranscript,
    deleteSession,
    toggleBookmark,
    loading
  };
}
