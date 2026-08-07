export default function MetricCard({ label, value, tone = 'default', subtext }) {
  return (
    <div className={`metric-card ${tone}`}>
      <p>{label}</p>
      <h3>{value}</h3>
      {subtext ? <span>{subtext}</span> : null}
    </div>
  );
}
