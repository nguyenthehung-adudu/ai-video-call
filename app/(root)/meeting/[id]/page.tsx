'use client';

import React, { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import MeetingSetup from '@/components/MeetingSetup';
import MeetingRoom from '@/components/MeetingRoom';
import { useUser } from '@clerk/nextjs';
import { StreamCall, StreamTheme } from '@stream-io/video-react-sdk';
import { useGetCallById } from '@/hooks/useGetCallById';
import Loader from '@/components/Loader';

const MeetingPage = () => {
  const params = useParams();
  const id = params?.id as string;
  const { user, isLoaded } = useUser();

  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [revision, setRevision] = useState(0);

  const { call, isCallLoading, loadError, clearCache } = useGetCallById(
    id,
    user?.id ?? '',
    revision,
  );

  const handleRetry = useCallback(() => {
    clearCache();
    setRevision(r => r + 1);
  }, [clearCache]);

  return (
    <main className="h-screen w-full relative">
      {/* StreamCall wrapper */}
      {call && (
        <StreamCall call={call}>
          <StreamTheme>
            {!isSetupComplete ? (
              <MeetingSetup setIsSetupComplete={() => setIsSetupComplete(true)} />
            ) : (
              <MeetingRoom meetingId={call.id} />
            )}
          </StreamTheme>
        </StreamCall>
      )}

      {/* Loading overlay */}
      {(!isLoaded || isCallLoading) && (
        <div className="absolute inset-0 bg-dark-2 flex items-center justify-center z-50">
          <Loader />
        </div>
      )}

      {/* Error overlay */}
      {(loadError || (!call && !isCallLoading && isLoaded)) && (
        <div className="absolute inset-0 bg-dark-2/95 flex flex-col gap-4 items-center justify-center z-50 px-4 text-center">
          <p className="text-red-400">{loadError ?? 'Call not found'}</p>
          <button
            type="button"
            className="rounded-lg bg-blue-1 px-4 py-2 text-white"
            onClick={handleRetry}
          >
            Retry
          </button>
        </div>
      )}
    </main>
  );
};

export default MeetingPage;