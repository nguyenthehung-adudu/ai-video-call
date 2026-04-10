'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MeetingSetup from '@/components/MeetingSetup';
import MeetingRoom from '@/components/MeetingRoom';
import { useUser } from '@clerk/nextjs';
import { StreamCall, StreamTheme } from '@stream-io/video-react-sdk';
import { useGetCallById } from '@/hooks/useGetCallById';
import Loader from '@/components/Loader';

const Meeting = () => {
  const params = useParams();
  const id = params?.id as string;

  const router = useRouter();
  const { user, isLoaded } = useUser();

  const [isSetupComplete, setIsSetupComplete] = useState(false);
  // Bump to force re-fetch after tab becomes visible
  const [visibilityKey, setVisibilityKey] = useState(0);

  const { call, isCallLoading, loadError } = useGetCallById(id, visibilityKey);

  // Reconnect when tab becomes active again
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Meeting] tab visible — re-fetching call');
        setVisibilityKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!isLoaded) return <Loader />;

  if (!user) {
    router.push('/sign-in');
    return <Loader />;
  }

  if (isCallLoading) {
    return (
      <div className="text-white flex items-center justify-center h-screen">
        Loading call...
      </div>
    );
  }

  if (loadError || !call) {
    return (
      <div className="text-red-400 flex flex-col gap-3 items-center justify-center h-screen px-4 text-center">
        <p>{loadError ?? 'Call not found'}</p>
        <button
          type="button"
          className="rounded-lg bg-blue-1 px-4 py-2 text-white"
          onClick={() => setVisibilityKey((k) => k + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main className="h-screen w-full">
      <StreamCall call={call}>
        <StreamTheme>
          {!isSetupComplete ? (
            <MeetingSetup setIsSetupComplete={setIsSetupComplete} />
          ) : (
            <MeetingRoom meetingId={call.id} />
          )}
        </StreamTheme>
      </StreamCall>
    </main>
  );
};

export default Meeting;
