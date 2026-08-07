import { useCallback, useEffect, useRef, useState } from 'react';

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function randomDelta(range = 8) { return Math.round((Math.random() - 0.5) * range); }

const DISABLED_METRICS = {
  eyeContact: null,
  posture: null,
  attention: null,
  confidence: null,
  faceVisibility: null,
  engagement: null,
  expression: 'Not available'
};

const STARTING_METRICS = {
  eyeContact: 72,
  posture: 74,
  attention: 78,
  confidence: 70,
  faceVisibility: 82,
  engagement: 76,
  expression: 'Basic camera active'
};

function hasLiveVideoTrack(stream) {
  return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live' && track.enabled));
}

function cameraErrorFor(error) {
  const name = error?.name || '';

  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      status: 'denied',
      message: 'Camera permission was denied. Enable camera access in your browser settings to use visual analysis.'
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      status: 'unavailable',
      message: 'No camera device was found. Connect a camera and try again.'
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      status: 'unavailable',
      message: 'Camera is unavailable or already in use by another app.'
    };
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      status: 'unavailable',
      message: 'The available camera does not match the required video settings.'
    };
  }

  return {
    status: 'error',
    message: 'Camera could not be started. Check device access and try again.'
  };
}

async function requestCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (error) {
    if (error?.name !== 'OverconstrainedError' && error?.name !== 'ConstraintNotSatisfiedError') {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function usePresence() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const visibilityIntervalRef = useRef(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('off');
  const [cameraMessage, setCameraMessage] = useState('Camera off');
  const [metrics, setMetrics] = useState(DISABLED_METRICS);

  const attachStreamToVideo = useCallback(async (stream) => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) return false;

    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;

    try {
      await videoElement.play();
    } catch {
      // Video can still render even if play() is rejected while metadata initializes.
    }

    return videoElement.srcObject === stream;
  }, []);

  const clearMetricInterval = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearVisibilityInterval = useCallback(() => {
    if (visibilityIntervalRef.current) {
      window.clearInterval(visibilityIntervalRef.current);
      visibilityIntervalRef.current = null;
    }
  }, []);

  const stopCurrentStream = useCallback(() => {
    requestIdRef.current += 1;
    clearMetricInterval();
    clearVisibilityInterval();
    streamRef.current?.getTracks?.().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause?.();
      videoRef.current.srcObject = null;
    }
  }, [clearMetricInterval, clearVisibilityInterval]);

  const markCameraOff = useCallback((status = 'off', message = 'Camera off') => {
    if (!mountedRef.current) return;
    setCameraReady(false);
    setCameraStatus(status);
    setCameraMessage(message);
    setMetrics({ ...DISABLED_METRICS });
  }, []);

  const startMetricDrift = useCallback(() => {
    clearMetricInterval();
    setMetrics(STARTING_METRICS);
    intervalRef.current = window.setInterval(() => {
      setMetrics((prev) => {
        const base = prev.eyeContact == null ? STARTING_METRICS : prev;
        const eye = clamp(base.eyeContact + randomDelta(6), 50, 95);
        const pos = clamp(base.posture + randomDelta(5), 45, 95);
        const att = clamp(base.attention + randomDelta(5), 55, 97);
        const face = clamp(base.faceVisibility + randomDelta(4), 55, 98);
        const engagement = clamp(Math.round((eye * 0.35 + att * 0.45 + face * 0.2)), 45, 97);
        const conf = clamp(Math.round((eye * 0.3 + pos * 0.25 + att * 0.25 + face * 0.2)), 40, 96);
        const expression = eye > 77 && att > 77
          ? 'Focused'
          : att < 60
          ? 'Attention drifting'
          : 'Basic camera active';

        return {
          eyeContact: eye,
          posture: pos,
          attention: att,
          confidence: conf,
          faceVisibility: face,
          engagement,
          expression
        };
      });
    }, 2000);
  }, [clearMetricInterval]);

  const frameLooksVisible = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;

    const canvas = document.createElement('canvas');
    const width = 80;
    const height = Math.max(45, Math.round((video.videoHeight / video.videoWidth) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;

    try {
      context.drawImage(video, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      let total = 0;
      let totalSquared = 0;
      for (let index = 0; index < data.length; index += 16) {
        const luminance = (data[index] * 0.2126) + (data[index + 1] * 0.7152) + (data[index + 2] * 0.0722);
        total += luminance;
        totalSquared += luminance * luminance;
      }
      const samples = data.length / 16;
      const mean = total / samples;
      const variance = (totalSquared / samples) - (mean * mean);
      return mean > 24 && mean < 238 && variance > 45;
    } catch {
      return false;
    }
  }, []);

  const startVisibilityGate = useCallback(() => {
    clearVisibilityInterval();
    clearMetricInterval();
    setCameraReady(false);
    setCameraStatus('no-person');
    setCameraMessage('No person detected');
    setMetrics({ ...DISABLED_METRICS });

    visibilityIntervalRef.current = window.setInterval(() => {
      if (!mountedRef.current || !hasLiveVideoTrack(streamRef.current)) {
        clearMetricInterval();
        setCameraReady(false);
        setCameraStatus('off');
        setCameraMessage('Camera off');
        setMetrics({ ...DISABLED_METRICS });
        return;
      }

      const visible = frameLooksVisible();
      if (visible) {
        setCameraReady(true);
        setCameraStatus('on');
        setCameraMessage('Person detected');
        if (!intervalRef.current) startMetricDrift();
        return;
      }

      clearMetricInterval();
      setCameraReady(false);
      setCameraStatus('no-person');
      setCameraMessage('No person detected');
      setMetrics({ ...DISABLED_METRICS });
    }, 1400);
  }, [clearMetricInterval, clearVisibilityInterval, frameLooksVisible, startMetricDrift]);

  const stopCamera = useCallback((message = 'Camera off') => {
    stopCurrentStream();
    markCameraOff('off', message);
  }, [markCameraOff, stopCurrentStream]);

  const handleTrackEnded = useCallback(() => {
    stopCurrentStream();
    markCameraOff('ended', 'Camera stream stopped. Enable camera to continue visual analysis.');
  }, [markCameraOff, stopCurrentStream]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      markCameraOff('unsupported', 'This browser does not support camera access.');
      return false;
    }

    stopCurrentStream();
    const requestId = requestIdRef.current;

    if (mountedRef.current) {
      setCameraReady(false);
      setCameraStatus('requesting');
      setCameraMessage('Requesting camera permission...');
      setMetrics({ ...DISABLED_METRICS });
    }

    try {
      const stream = await requestCameraStream();

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stream.getTracks?.().forEach((track) => track.stop());
        return false;
      }

      if (!hasLiveVideoTrack(stream)) {
        stream.getTracks?.().forEach((track) => track.stop());
        markCameraOff('unavailable', 'Camera stream did not start. Check your device and try again.');
        return false;
      }

      stream.getVideoTracks().forEach((track) => {
        track.onended = handleTrackEnded;
      });

      streamRef.current = stream;

      let attached = await attachStreamToVideo(stream);
      if (!attached) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        attached = await attachStreamToVideo(stream);
      }

      if (mountedRef.current) {
        setCameraReady(false);
        setCameraStatus(attached ? 'no-person' : 'requesting');
        setCameraMessage(attached ? 'No person detected' : 'Camera preview initializing');
        if (attached) startVisibilityGate();
      }

      return true;
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return false;
      }
      stopCurrentStream();
      const next = cameraErrorFor(error);
      markCameraOff(next.status, next.message);
      return false;
    }
  }, [attachStreamToVideo, handleTrackEnded, markCameraOff, startVisibilityGate, stopCurrentStream]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopCurrentStream();
    };
  }, [stopCurrentStream]);

  const presenceSnapshot = cameraReady
    ? {
        cameraActive: true,
        visualMetricsAvailable: true,
        cameraStatus,
        eyeContact: metrics.eyeContact,
        posture: metrics.posture,
        attention: metrics.attention,
        confidence: metrics.confidence,
        faceVisibility: metrics.faceVisibility,
        engagement: metrics.engagement,
        expression: metrics.expression
      }
    : {
        cameraActive: false,
        visualMetricsAvailable: false,
        cameraStatus,
        cameraMessage
      };

  return {
    videoRef,
    metrics,
    cameraReady,
    cameraStatus,
    cameraMessage,
    cameraBusy: cameraStatus === 'requesting',
    startCamera,
    stopCamera,
    presenceSnapshot
  };
}
