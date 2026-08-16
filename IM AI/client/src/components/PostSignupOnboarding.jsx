import { Sparkles } from 'lucide-react';
import { DOMAINS } from '../lib/domains.js';
import SelectCard from './SelectCard.jsx';

export default function PostSignupOnboarding({ onSelectDomain, onSkip }) {
  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <h2><Sparkles size={18} style={{ verticalAlign: '-3px', marginRight: '6px' }} />What role are you preparing for?</h2>
        <p>Pick a domain to jump straight into a pre-filled Setup page — or skip and choose later.</p>
      </div>

      <div className="domain-grid">
        {DOMAINS.map((domain) => {
          const DomainIcon = domain.icon;
          return (
            <SelectCard
              key={domain.value}
              selected={false}
              onSelect={() => onSelectDomain(domain.value)}
              ariaLabel={domain.label}
              className="domain-card"
            >
              <span className="domain-icon"><DomainIcon size={17} /></span>
              <span className="domain-name">{domain.label}</span>
            </SelectCard>
          );
        })}
      </div>

      <button type="button" className="btn btn-ghost w-full mt-4" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  );
}
