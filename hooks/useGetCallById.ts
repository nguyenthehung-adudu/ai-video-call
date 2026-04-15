import { useCallback, useEffect, useRef, useState } from 'react';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';

/**
 * Load (or return cached) call by id.
 * Uses client from StreamVideoProvider - no separate client creation.
 */
export const useGetCallById = (
  id: string,
  _uid: string,
  revision = 0,
) => {
  const [call, setCall] = useState<Call | null>(null);
  const [isCallLoading, setIsCallLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const client = useStreamVideoClient();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  // Reset when id changes
  useEffect(() => {
    console.log('[useGetCallById] id changed:', id);
    setCall(null);
    setIsCallLoading(true);
    setLoadError(null);
    hasLoadedRef.current = false;
  }, [id]);

  const clearCache = useCallback(() => {
    console.log('[useGetCallById] clearCache');
    setCall(null);
    setIsCallLoading(true);
    setLoadError(null);
    hasLoadedRef.current = false;
  }, []);

  useEffect(() => {
    // Wait for client
    if (!client) {
      setIsCallLoading(true);
      return;
    }

    // Wait for id
    if (!id) {
      setCall(null);
      setIsCallLoading(false);
      return;
    }

    // Skip if already loaded
    if (hasLoadedRef.current && call?.id === id) {
      return;
    }

    let cancelled = false;
    setIsCallLoading(true);
    setLoadError(null);

    const loadCall = async () => {
      try {
        console.log('[useGetCallById] Creating call:', id);
        const c = client.call('default', id);
        
        if (cancelled) return;
        
        console.log('[useGetCallById] getOrCreate...');
        await c.getOrCreate();
        
        if (cancelled) return;
        
        hasLoadedRef.current = true;
        setCall(c);
        setLoadError(null);
        console.log('[useGetCallById] Success:', c.id);
      } catch (err) {
        if (cancelled) return;
        
        console.error('[useGetCallById] Error:', err);
        hasLoadedRef.current = false;
        setCall(null);
        setLoadError(err instanceof Error ? err.message : 'Could not load meeting');
      } finally {
        if (!cancelled) {
          setIsCallLoading(false);
        }
      }
    };

    loadCall();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [id, client, revision]);

  return { call, isCallLoading, loadError, clearCache };
};