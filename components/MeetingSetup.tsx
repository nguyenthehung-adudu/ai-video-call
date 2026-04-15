'use client';
import { VideoPreview, useCall } from '@stream-io/video-react-sdk';
import React, { useState, useEffect, useCallback } from 'react';
import { DeviceSettings } from '@stream-io/video-react-sdk';
import { Button } from './ui/button';

const MeetingSetup = ({ setIsSetupComplete }: { setIsSetupComplete: (value: boolean) => void }) => {
  const [isMicCamToggledOn, setIsMicCamToggledOn] = useState(false);
  const call = useCall();

  console.log("⚙️ [MeetingSetup] Render:", {
    hasCall: !!call,
    callId: call?.id,
    isMicCamToggledOn,
    callingState: call?.state?.callingState,
  });

  // Toggle camera/mic
  useEffect(() => {
    if (!call) return;

    if (isMicCamToggledOn) {
      call.camera.disable();
      call.microphone.disable();
    } else {
      call.camera.enable();
      call.microphone.enable();
    }
  }, [isMicCamToggledOn, call]);

  const handleJoin = useCallback(async () => {
    if (!call) {
      console.error("⚙️ [MeetingSetup] No call to join!");
      return;
    }

    console.log("⚙️ [MeetingSetup] Calling call.join()...");
    
    try {
      await call.join();
      console.log("⚙️ [MeetingSetup] call.join() SUCCESS");
    } catch (err) {
      console.error("⚙️ [MeetingSetup] call.join() ERROR:", err);
    }
    
    console.log("⚙️ [MeetingSetup] Setting isSetupComplete(true)...");
    setIsSetupComplete(true);
    console.log("⚙️ [MeetingSetup] Done!");
  }, [call, setIsSetupComplete]);

  if (!call) {
    console.error("⚙️ [MeetingSetup] call is NULL!");
    throw new Error('Call not available');
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 text-white">
      <h1 className="text-2xl font-bold">Meeting Setup</h1>
      <VideoPreview />
      <div className="flex h-16 items-center justify-center gap-3">
        <label className="flex items-center justify-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={isMicCamToggledOn}
            onChange={(e) => setIsMicCamToggledOn(e.target.checked)}
          />
          Tắt cam và mic khi tham gia
        </label>
        <DeviceSettings />
      </div>
      <Button className="rounded-md bg-green-500 px-4 py-2.5" onClick={handleJoin}>
        Vào phòng
      </Button>
    </div>
  );
};

export default MeetingSetup;