import { useEffect, useState } from 'react';

function decodeJwt(token) {
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function readIsGuest() {
  return decodeJwt(localStorage.getItem('interview_mirror_access_token'))?.isGuest === true;
}

export function useAuthStatus() {
  const [isGuestSession, setIsGuestSession] = useState(readIsGuest);

  useEffect(() => {
    function refresh() {
      setIsGuestSession(readIsGuest());
    }
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  return { isGuestSession };
}
