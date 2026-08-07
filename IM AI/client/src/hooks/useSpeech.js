import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const PERSONA_MAP = {
  'calm-senior-interviewer': {
    rate: 0.92,
    pitch: 0.96,
    keywords: ['Rishi', 'Samantha', 'Google UK English Female', 'Female'],
  },
  'friendly-recruiter': {
    rate: 1.02,
    pitch: 1.08,
    keywords: ['Samantha', 'Google US English', 'Female'],
  },
  'strict-panelist': {
    rate: 0.88,
    pitch: 0.88,
    keywords: ['Daniel', 'David', 'Male'],
  },
  'startup-founder': {
    rate: 1.05,
    pitch: 1.0,
    keywords: ['Alex', 'Google US English', 'Male'],
  },
  'technical-mentor': {
    rate: 0.94,
    pitch: 1.02,
    keywords: ['Samantha', 'Google UK English Female', 'Female'],
  },
  'senior-engineering-manager': {
    rate: 0.9,
    pitch: 0.94,
    keywords: ['Daniel', 'David', 'Male'],
  },
  'strict-product-interviewer': {
    rate: 0.95,
    pitch: 0.98,
    keywords: ['Rishi', 'Google US English', 'Female'],
  },
};

function pickVoiceForPersona(voiceList = [], persona = 'calm-senior-interviewer') {
  if (!voiceList.length) return null;

  const config = PERSONA_MAP[persona] || PERSONA_MAP['calm-senior-interviewer'];
  const keywords = (config.keywords || []).map((keyword) => String(keyword || '').toLowerCase());
  const sortedVoices = [...voiceList].sort((a, b) => (
    `${a?.name || ''}|${a?.lang || ''}`.localeCompare(`${b?.name || ''}|${b?.lang || ''}`)
  ));

  let bestVoice = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  sortedVoices.forEach((voice) => {
    const name = String(voice?.name || '').toLowerCase();
    const lang = String(voice?.lang || '').toLowerCase();
    let score = 0;

    keywords.forEach((keyword) => {
      if (keyword && name.includes(keyword)) score += 8;
    });

    if (lang.startsWith('en-in')) score += 6;
    else if (lang.startsWith('en-us')) score += 5;
    else if (lang.startsWith('en-gb')) score += 4;
    else if (lang.startsWith('en')) score += 3;

    if (voice?.default) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  });

  return bestVoice || sortedVoices[0] || null;
}

export function useSpeech(persona = 'calm-senior-interviewer') {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [speechError, setSpeechError] = useState('');
  const [lockedVoice, setLockedVoice] = useState({
    persona,
    name: '',
    lang: ''
  });

  const recognitionRef = useRef(null);
  const manualStopRef = useRef(true);
  const ttsActiveRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const speakingTimeoutRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const populateVoices = () => {
      const loadedVoices = synth.getVoices ?.() || [];
      setVoices(loadedVoices);
    };

    populateVoices();

    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = populateVoices;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    setLockedVoice((current) => (
      current.persona === persona
        ? current
        : {
            persona,
            name: '',
            lang: ''
          }
    ));
  }, [persona]);

  useEffect(() => {
    if (!voices.length) return;

    setLockedVoice((current) => {
      if (current.persona !== persona) {
        return {
          persona,
          name: '',
          lang: ''
        };
      }

      if (current.name) {
        const existing = voices.find((voice) => (
          voice.name === current.name && (!current.lang || voice.lang === current.lang)
        )) || voices.find((voice) => voice.name === current.name);

        if (existing) return current;
      }

      const nextVoice = pickVoiceForPersona(voices, persona);
      if (!nextVoice) return current;

      return {
        persona,
        name: nextVoice.name,
        lang: nextVoice.lang || ''
      };
    });
  }, [persona, voices]);

  const selectedVoice = useMemo(() => {
    if (!voices.length) return null;

    if (lockedVoice.name) {
      const matchingVoice = voices.find((voice) => (
        voice.name === lockedVoice.name && (!lockedVoice.lang || voice.lang === lockedVoice.lang)
      )) || voices.find((voice) => voice.name === lockedVoice.name);

      if (matchingVoice) return matchingVoice;
    }

    return pickVoiceForPersona(voices, persona);
  }, [lockedVoice.lang, lockedVoice.name, persona, voices]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0] ?.transcript || '';

        if (result.isFinal) {
          finalTranscript += `${text} `;
        } else {
          interimTranscript += text;
        }
      }

      finalTranscriptRef.current = finalTranscript.trim();
      const combined = `${finalTranscriptRef.current} ${interimTranscript}`.trim();
      setTranscript(combined);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Chrome stops continuous recognition on silence — restart if user is still expected to be speaking
      if (!manualStopRef.current && !ttsActiveRef.current) {
        window.setTimeout(() => {
          if (!manualStopRef.current && !ttsActiveRef.current) {
            try { recognition.start(); } catch { /* already started or unavailable */ }
          }
        }, 150);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      manualStopRef.current = true;
      try {
        recognition.stop();
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  function startListening() {
    const recognition = recognitionRef.current;

    if (!recognition) {
      setSpeechError('Speech recognition requires Chrome or Edge.');
      return;
    }

    if (window.speechSynthesis ?.speaking) {
      return;
    }

    manualStopRef.current = false;
    setSpeechError('');
    finalTranscriptRef.current = transcript.trim();

    try {
      recognition.start();
    } catch (err) {
      console.error('Speech recognition start failed:', err);
    }
  }

  function stopListening() {
    manualStopRef.current = true;

    try {
      recognitionRef.current ?.stop ?.();
    } catch (err) {
      console.error('Speech recognition stop failed:', err);
    }

    setIsListening(false);
  }

  function speak(text, options = {}) {
    const synth = window.speechSynthesis;
    if (!synth || !text ?.trim()) return;

    const {
      autoListen = true
    } = options;
    const trimmedText = text.trim();

    ttsActiveRef.current = true;
    manualStopRef.current = !autoListen;
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // Recognition may already be stopped while the interviewer is speaking.
    }
    setIsListening(false);

    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }

    if (synth.speaking || synth.pending) {
      synth.cancel();
    }

    const config = PERSONA_MAP[persona] || PERSONA_MAP['calm-senior-interviewer'];
    const utterance = new SpeechSynthesisUtterance(trimmedText);

    const availableVoices = synth.getVoices() || voices;
    let safeVoice = null;

    if (lockedVoice.name) {
      safeVoice = availableVoices.find((voice) => (
        voice.name === lockedVoice.name && (!lockedVoice.lang || voice.lang === lockedVoice.lang)
      )) || availableVoices.find((voice) => voice.name === lockedVoice.name);
    }

    if (!safeVoice && selectedVoice) {
      safeVoice = availableVoices.find((voice) => voice.name === selectedVoice.name && voice.lang === selectedVoice.lang)
        || availableVoices.find((voice) => voice.name === selectedVoice.name);
    }

    if (!safeVoice) {
      safeVoice = pickVoiceForPersona(availableVoices, persona);
    }

    if (safeVoice && (
      lockedVoice.persona !== persona
      || lockedVoice.name !== safeVoice.name
      || (lockedVoice.lang || '') !== (safeVoice.lang || '')
    )) {
      setLockedVoice({
        persona,
        name: safeVoice.name,
        lang: safeVoice.lang || ''
      });
    }

    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.volume = 1;
    utterance.lang = safeVoice ?.lang || 'en-US';

    if (safeVoice) {
      utterance.voice = safeVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      ttsActiveRef.current = false;
      setIsSpeaking(false);
      currentUtteranceRef.current = null;

      if (autoListen && !manualStopRef.current) {
        startListening();
      }
    };

    utterance.onerror = (event) => {
      ttsActiveRef.current = false;
      if (event.error === 'canceled' || event.error === 'interrupted') {
        console.log('Speech was interrupted:', event.error);
      } else {
        console.error('Speech synthesis error:', event.error, event);
      }

      setIsSpeaking(false);
      currentUtteranceRef.current = null;

      if (autoListen && !manualStopRef.current && event.error !== 'canceled' && event.error !== 'interrupted') {
        startListening();
      }
    };

    currentUtteranceRef.current = utterance;

    speakingTimeoutRef.current = setTimeout(() => {
      try {
        synth.speak(utterance);
      } catch (err) {
        console.error('speechSynthesis.speak failed:', err);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
      }
    }, 250);
  }

  function stopSpeaking() {
    ttsActiveRef.current = false;
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }

    window.speechSynthesis ?.cancel ?.();
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
  }

  const stopAllSpeechActivity = useCallback(() => {
    manualStopRef.current = true;
    ttsActiveRef.current = false;

    try {
      recognitionRef.current?.abort?.();
    } catch {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // ignore cleanup error
      }
    }

    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }

    window.speechSynthesis?.cancel?.();
    currentUtteranceRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  useEffect(() => () => {
    manualStopRef.current = true;
    ttsActiveRef.current = false;

    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }

    try {
      recognitionRef.current?.abort?.();
    } catch {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // ignore cleanup error
      }
    }

    window.speechSynthesis?.cancel?.();
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
    setIsListening(false);
  }, []);

  function resetTranscript() {
    finalTranscriptRef.current = '';
    setTranscript('');
    setSpeechError('');
  }

  return {
    transcript,
    setTranscript,
    isListening,
    isSpeaking,
    speak,
    stopSpeaking,
    stopAllSpeechActivity,
    startListening,
    stopListening,
    resetTranscript,
    speechError,
    availableVoices: voices.map((voice) => `${voice.name} - ${voice.lang}`),
  };
}
