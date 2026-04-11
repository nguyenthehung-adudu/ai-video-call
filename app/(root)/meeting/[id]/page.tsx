'use client';

console.log('🔥 [PAGE] FILE LOADING - meeting/[id]/page.tsx');

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MeetingSetup from '@/components/MeetingSetup';
import MeetingRoom from '@/components/MeetingRoom';
import { useUser } from '@clerk/nextjs';
import { StreamCall, StreamTheme } from '@stream-io/video-react-sdk';
import { useGetCallById } from '@/hooks/useGetCallById';
import Loader from '@/components/Loader';

console.log('🔥 [PAGE] Imports done');

const Meeting = () => {
  console.log('🔥 [PAGE] Component body executing');

  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { user, isLoaded } = useUser();

  console.log('🔥 [PAGE] Hooks called:', {
    id,
    isLoaded,
    hasUser: !!user,
    userId: user?.id,
  });

  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [revision, setRevision] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  // Stable refs
  const userIdRef = useRef(user?.id ?? '');
  userIdRef.current = user?.id ?? '';

  const { call, isCallLoading, loadError, clearCache } = useGetCallById(
    id,
    userIdRef.current,
    revision,
  );

  console.log('🔥 [PAGE] State:', {
    id,
    isCallLoading,
    hasCall: !!call,
    callId: call?.id,
    loadError,
    isSetupComplete,
    revision,
  });

  // Track mount/unmount
  useEffect(() => {
    console.log('🟢 [PAGE] Mounted:', { id });
    return () => {
      console.log('💀 [PAGE] Unmounted:', { id });
    };
  }, [id]);

  // ── Retry ──────────────────────────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    console.log('🔁 [PAGE] Retry clicked:', { id });
    setIsRetrying(true);
    try {
      clearCache();
      setRevision((r) => r + 1);
    } finally {
      setIsRetrying(false);
    }
  }, [clearCache]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="h-screen w-full relative">
      {/* StreamCall wrapper */}
      {call ? (
        <StreamCall call={call}>
          <StreamTheme>
            {!isSetupComplete ? (
              <MeetingSetup setIsSetupComplete={setIsSetupComplete} />
            ) : (
              <MeetingRoom meetingId={call.id} />
            )}
          </StreamTheme>
        </StreamCall>
      ) : null}

      {/* Loading overlay */}
      {(!isLoaded || isCallLoading) && (
        <div className="absolute inset-0 bg-dark-2 flex items-center justify-center z-50">
          <Loader />
        </div>
      )}

      {/* User not loaded */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-dark-2 flex items-center justify-center z-40">
          <Loader />
        </div>
      )}

      {/* Error overlay */}
      {(loadError || (!call && !isCallLoading && isLoaded)) && (
        <div className="absolute inset-0 bg-dark-2/95 flex flex-col gap-4 items-center justify-center z-50 px-4 text-center">
          <p className="text-red-400">{loadError ?? 'Call not found'}</p>
          <button
            type="button"
            disabled={isRetrying}
            className="rounded-lg bg-blue-1 px-4 py-2 text-white disabled:opacity-50"
            onClick={handleRetry}
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}
    </main>
  );
};

export default Meeting;
