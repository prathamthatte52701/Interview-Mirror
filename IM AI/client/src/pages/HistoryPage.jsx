import { History, ListChecks } from 'lucide-react';
import { useSessionHistory } from '../hooks/useSessionHistory.js';
import { useAuthStatus } from '../hooks/useAuthStatus.js';
import SessionList from '../components/SessionList.jsx';
import SessionDetail from '../components/SessionDetail.jsx';
import GuestLockScreen from '../components/GuestLockScreen.jsx';

export default function HistoryPage({ history = [], loading = false, onStart, onLogout, onSessionDeleted }) {
  const { isGuestSession } = useAuthStatus();
  const {
    sessions, selectedId, selectSession, selectedSession, selectedTranscript, transcriptLoading, deleteSession, toggleBookmark
  } = useSessionHistory(history, loading, onSessionDeleted);

  if (isGuestSession) {
    return (
      <GuestLockScreen
        icon="🔒"
        title="History is locked"
        message="Sign in to view your interview history."
        onSignUp={() => onLogout('/signup')}
        onLogIn={() => onLogout('/login')}
      />
    );
  }

  return (
    <div className="history-page anim-fade-up">
      <div className="history-page-header">
        <div>
          <span className="setup-eyebrow"><History size={14} /> Session history</span>
          <h2>Interview history</h2>
          <p>Browse, search, and review every interview session you've completed.</p>
        </div>
      </div>

      {!loading && sessions.length === 0 ? (
        <div className="panel dashboard-empty-state history-empty-state">
          <History size={26} />
          <strong>No interview sessions yet.</strong>
          <span>Finish a mock interview and your results will appear here.</span>
          <button className="btn btn-primary" type="button" onClick={onStart}>Start Interview</button>
        </div>
      ) : (
        <div className="history-page-layout">
          <div className="panel history-table-panel">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><ListChecks size={16} /> Previous sessions</span>
              <span className="panel-badge">{sessions.length}</span>
            </div>

            <SessionList
              sessions={sessions}
              selectedId={selectedId}
              onSelect={selectSession}
              onDelete={deleteSession}
              loading={loading}
            />
          </div>

          <SessionDetail
            session={selectedSession}
            transcript={selectedTranscript}
            transcriptLoading={transcriptLoading}
            loading={loading}
            eyebrow="History detail"
            className="history-detail-panel"
            onToggleBookmark={toggleBookmark}
          />
        </div>
      )}
    </div>
  );
}
