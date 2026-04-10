import { useEffect, useRef, useState } from 'react';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';

const LOAD_TIMEOUT_MS = 45_000;

export const useGetCallById = (id: string, revision = 0) => {
  const client = useStreamVideoClient();

  const [call, setCall] = useState<Call | null>(null);
  const [isCallLoading, setIsCallLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !id) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const loadCall = async () => {
      setIsCallLoading(true);
      setLoadError(null);

      timerId = setTimeout(() => {
        if (!cancelled) {
          console.warn('[useGetCallById] timeout — retry with fresh key');
          setLoadError('Loading timed out. Try refreshing the page.');
          setIsCallLoading(false);
        }
      }, LOAD_TIMEOUT_MS);

      try {
        console.log('📡 LOAD CALL:', id, 'rev', revision);
        const c = client.call('default', id);
        await c.getOrCreate();

        if (!cancelled) {
          console.log('✅ CALL OK:', c.id);
          setCall(c);
        }
      } catch (err) {
        console.error('❌ LOAD CALL ERROR:', err);
        if (!cancelled) {
          setCall(null);
          setLoadError(err instanceof Error ? err.message : 'Could not load meeting');
        }
      } finally {
        clearTimeout(timerId);
        if (!cancelled) setIsCallLoading(false);
      }
    };

    void loadCall();

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [client, id, revision]);

  return { call, isCallLoading, loadError };
};
