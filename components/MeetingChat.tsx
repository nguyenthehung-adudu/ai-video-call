"use client";

import { useEffect, useState } from "react";
import {
  Channel,
  MessageList,
  MessageInput,
  useChatContext,
} from "stream-chat-react";
import { useUser } from "@clerk/nextjs";

const MeetingChat = ({ meetingId }: { meetingId: string }) => {
  const { client } = useChatContext();
  const { user } = useUser();
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    if (!client || !user) return;

    const ch = client.channel("messaging", `meeting-${meetingId}`, {
  members: [user.id, ], 
});

    ch.watch();
    setChannel(ch);
  }, [client, user, meetingId]);

  if (!channel) return <div className="p-2 text-white">Loading chat...</div>;

  return (
    <Channel channel={channel}>
      <div className="flex flex-col h-full bg-dark-1 text-white">
        
        {/* ✅ KHÔNG CUSTOM */}
        <MessageList />

        <MessageInput />
      </div>
    </Channel>
  );
};

export default MeetingChat;