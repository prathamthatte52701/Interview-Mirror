export default function QuestionCard({ question, persona, onSpeak, onStop, pressureScore, remainingSeconds, mood }) {
  return (
    <section className="panel question-card">
      <div className="panel-header">
        <h3>Question in progress</h3>
        <span>{persona.replaceAll('-', ' ')} · {mood}</span>
      </div>
      <p className="question-main">{question}</p>
      <div className="interview-status-row">
        <div className="mini-stat"><strong>{remainingSeconds}s</strong><span>answer window</span></div>
        <div className="mini-stat"><strong>{pressureScore}</strong><span>pressure</span></div>
      </div>
      <div className="button-row">
        <button className="primary-button" onClick={() => onSpeak(question)}>Speak question</button>
        <button className="ghost-button" onClick={onStop}>Stop voice</button>
      </div>
    </section>
  );
}
