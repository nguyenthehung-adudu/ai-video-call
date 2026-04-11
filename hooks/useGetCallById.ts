import { useCallback, useEffect, useRef, useState } from 'react';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';

/** Module-level call cache — survives component re-renders. */
export const _callCache = new Map<string, Call>();

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

  // Get client from StreamVideoProvider
  const client = useStreamVideoClient();

  const cachedCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const loadStartTimeRef = useRef<number>(0);

  console.log('🔍 [useGetCallById] Render:', {
    id,
    hasClient: !!client,
    hasCachedCall: !!cachedCallRef.current,
    revision,
    isCallLoading,
    existingError: loadError,
  });

  // Check cache FIRST - return cached call immediately if available
  useEffect(() => {
    console.log('🔍 [useGetCallById] Cache check effect:', { id });
    const cachedCall = _callCache.get(id);
    if (cachedCall) {
      console.log('📦 [useGetCallById] ✅ Using CACHED call:', cachedCall.id);
      cachedCallRef.current = cachedCall;
      setCall(cachedCall);
      setIsCallLoading(false);
      setLoadError(null); // Clear any previous error
      hasLoadedRef.current = true;
      return;
    }
    console.log('📦 [useGetCallById] No cached call for:', id);
  }, [id]);

  effectIdRef.current++;
  const currentEffectId = effectIdRef.current;

  /** Clear cache — called by Retry button. */
  const clearCache = useCallback(() => {
    console.log('🗑️ [useGetCallById] Clearing cache:', { id });
    _callCache.delete(id);
    cachedCallRef.current = null;
    hasLoadedRef.current = false;
    setCall(null);
    setLoadError(null);
    setIsCallLoading(true);
  }, [id]);

  useEffect(() => {
    console.log('⚡ [useGetCallById] Main effect START:', {
      effectId: currentEffectId,
      id,
      clientExists: !!client,
      revision,
    });

    // Wait for client to be available
    if (!client) {
      console.log('⏳ [useGetCallById] ⏸️ Waiting for client (isCallLoading=true)');
      setIsCallLoading(true);
      return;
    }

    console.log('✅ [useGetCallById] Client available, checking load state...');

    // Skip if already loaded from cache
    if (hasLoadedRef.current && cachedCallRef.current) {
      console.log('✅ [useGetCallById] Skipping (already have cached call)');
      return;
    }

    if (!id) {
      console.log('⛔ [useGetCallById] Missing id, skipping');
      setCall(null);
      setIsCallLoading(false);
      return;
    }

    let cancelled = false;
    let loadSucceeded = false;
    loadStartTimeRef.current = Date.now();

    const loadCall = async () => {
      const elapsedAtStart = Date.now() - loadStartTimeRef.current;
      console.log('🚀 [useGetCallById] loadCall START:', {
        effectId: currentEffectId,
        id,
        elapsedMs: elapsedAtStart,
      });

      // Clear any pending timeout
      if (timerRef.current) {
        console.log('⏰ [useGetCallById] Clearing previous timeout');
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setIsCallLoading(true);
      setLoadError(null);

      try {
        console.log('📞 [useGetCallById] Creating call object:', id);
        const c = client.call('default', id);
        console.log('📞 [useGetCallById] Call object created:', c.id);

        if (cancelled) {
          console.log('⛔ [useGetCallById] Cancelled before getOrCreate');
          return;
        }

        console.log('📞 [useGetCallById] Calling getOrCreate...');
        const getOrCreateStart = Date.now();
        await c.getOrCreate();
        const getOrCreateTime = Date.now() - getOrCreateStart;
        console.log('📞 [useGetCallById] ✅ getOrCreate SUCCESS!', {
          timeMs: getOrCreateTime,
          callId: c.id,
        });

        if (cancelled) {
          console.log('⛔ [useGetCallById] Cancelled after getOrCreate');
          return;
        }

        loadSucceeded = true;
        _callCache.set(id, c);
        cachedCallRef.current = c;
        hasLoadedRef.current = true;
        setCall(c);
        setLoadError(null); // Clear any timeout error
        console.log('✅ [useGetCallById] Call set in state:', c.id);
      } catch (err) {
        if (cancelled) {
          console.log('⛔ [useGetCallById] Cancelled on error');
          return;
        }
        const elapsed = Date.now() - loadStartTimeRef.current;
        console.error('❌ [useGetCallById] Error:', {
          message: err instanceof Error ? err.message : err,
          elapsedMs: elapsed,
          id,
        });
        _callCache.delete(id);
        cachedCallRef.current = null;
        hasLoadedRef.current = false;
        setCall(null);
        setLoadError(
          err instanceof Error ? err.message : 'Could not load meeting',
        );
      } finally {
        // Clear timeout timer since load finished (success or error)
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (!cancelled) {
          const totalElapsed = Date.now() - loadStartTimeRef.current;
          console.log('🏁 [useGetCallById] loadCall FINISHED:', {
            effectId: currentEffectId,
            totalMs: totalElapsed,
            loadSucceeded,
            isCallLoadingWillBe: false,
          });
          setIsCallLoading(false);
        }
      }
    };

    void loadCall();

    return () => {
      const cleanupElapsed = Date.now() - loadStartTimeRef.current;
      console.log('🛑 [useGetCallById] Effect CLEANUP:', {
        effectId: currentEffectId,
        elapsedMs: cleanupElapsed,
      });
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [id, client, revision]);

  return { call, isCallLoading, loadError, clearCache };
};
