import { CallControls, CallingState, CallParticipantListing, CallParticipantsList, CallStatsButton, PaginatedGridLayout, SpeakerLayout, useCallStateHooks } from '@stream-io/video-react-sdk';
import { Grid, Users } from 'lucide-react';
import React from 'react'
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutList } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import EndCallButton from './EndCallButton';
import Loader from './Loader';
type CallLayoutType = 'grid' | 'speaker-left' | 'speaker-right';
const MeetingRoom = () => {
  const searchParams = useSearchParams();
  const isPersonalRoom = !!searchParams.get('personal');
  const [layout, setLayout] = useState<CallLayoutType>('speaker-left');
  const [showParticipants, setShowParticipants] = useState(false);
  
  const { useCallCallingState } = useCallStateHooks();
    const callingState = useCallCallingState();

      if (callingState !== CallingState.JOINED) return <Loader />;

  const CallLayout = () => {
    switch (layout) {
      case 'grid':
        return <PaginatedGridLayout/>
      case 'speaker-right':
        return <SpeakerLayout participantsBarPosition="left" />  
        default :
      return <SpeakerLayout participantsBarPosition="right" />
    
     
    }
  }
  return (
    <section className=" relative h-screen w-full overflow-hidden pt-4 text-white">
      <div className="relative flex size-full items-center justify-center">
        <div className="flex size-full max-w-[1000px] items-center">

          <CallLayout />
           
        </div>
        <div className={cn('h-[calc(100vh-86px)] hidden ml-2', { 'block': showParticipants })}>
          <CallParticipantsList onClose={() => setShowParticipants(false)}/>

        </div>
      </div>
      <div className="fixed bottom-0 w-full flex justify-center">
  <div className="flex items-center gap-5 flex-wrap">
    <CallControls />

    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]">
          <LayoutList size={20} className="text-white" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="border-dark-1 bg-dark-1 text-white">
        {['Grid', 'Speaker-Left', 'Speaker-Right'].map((item, index) => (
          <DropdownMenuItem
            key={index}
            onClick={() => setLayout(item.toLowerCase() as CallLayoutType)}
          >
            {item}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
        <CallStatsButton />
        <button onClick={() => setShowParticipants((prev) => !prev)}>
          <div className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]">
            <Users size={20} className="text-white" />
          </div>
        </button>
        {!isPersonalRoom && <EndCallButton />}
  </div>
</div>
      </section>
  )
}

export default MeetingRoom

