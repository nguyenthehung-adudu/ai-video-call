'use client';

// This component is DISABLED - using NotificationBell instead for Prisma-based notifications
// To re-enable, import and use in your layout/page

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useGetCalls } from '@/hooks/useGetCalls';
import { isEmailInvited } from '@/lib/invite';
import { Bell, X, User } from 'lucide-react';
import { formatMeetingDateTime } from '@/lib/utils';

interface Invitation {
  callId: string;
  title: string;
  startsAt: string;
  fromName: string;
  hostAvatar?: string;
}

export default function MeetingInvitationNotification() {
  // COMPONENT DISABLED - See NotificationBell.tsx for active notification system
  return null;

  // Original code preserved below for reference (not executed)
  /*
  const router = useRouter();
  const { user } = useUser();
  const { upcomingCalls, isLoading } = useGetCalls();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showAll, setShowAll] = useState(false);
  const lastProcessedRef = useRef<string>('');

  useEffect(() => {
    if (isLoading || !upcomingCalls || !user) return;
    const email = user.primaryEmailAddress?.emailAddress?.toLowerCase().trim();
    if (!email) return;

    const currentIds = upcomingCalls.map(c => c.id).sort().join(',');
    if (currentIds === lastProcessedRef.current) return;
    lastProcessedRef.current = currentIds;

    const invited: Invitation[] = upcomingCalls
      .filter((call) => {
        const hostId = call.state.createdBy?.id;
        if (hostId === user.id) return false;
        const searchStr = call.state.custom?.invitedEmailsStr as string | undefined;
        return isEmailInvited(searchStr, email);
      })
      .map((call) => ({
        callId: call.id,
        title: (call.state.custom?.description as string)?.trim() || `Cuộc họp ${call.id.slice(0, 8)}`,
        startsAt: call.state.startsAt || '',
        fromName: call.state.createdBy?.name || call.state.createdBy?.id || 'Chủ phòng',
        hostAvatar: call.state.createdBy?.image || undefined,
      }));

    setInvitations(invited);
  }, [upcomingCalls, isLoading, user]);

  const visibleInvitations = showAll ? invitations : invitations.slice(0, 2);
  const hasInvitations = invitations.length > 0;

  const handleJoin = (callId: string) => router.push(`/meeting/${callId}`);

  const handleDismiss = (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    setInvitations((prev) => prev.filter((inv) => inv.callId !== callId));
  };

  if (!hasInvitations || isLoading) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      <div className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg">
        <Bell size={18} />
        <span className="text-sm font-medium">Bạn được mời ({invitations.length})</span>
        {invitations.length > 2 && (
          <button onClick={() => setShowAll(!showAll)} className="ml-auto text-xs underline hover:text-purple-200">
            {showAll ? 'Thu gọn' : 'Xem thêm'}
          </button>
        )}
      </div>
      {visibleInvitations.map((inv) => (
        <div key={inv.callId} className="bg-dark-1 border border-dark-3 rounded-lg p-4 shadow-lg hover:border-purple-500 transition-colors cursor-pointer" onClick={() => handleJoin(inv.callId)}>
          <div className="flex items-start gap-3">
            {inv.hostAvatar ? (
              <img src={inv.hostAvatar} alt={inv.fromName} className="w-10 h-10 rounded-full object-cover border border-dark-3" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                <User size={18} className="text-purple-400" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-purple-400 font-semibold text-sm">{inv.title}</p>
              <p className="text-white/60 text-xs mt-2">{inv.fromName} đã mời bạn tham gia</p>
              {inv.startsAt && <p className="text-purple-400/70 text-xs mt-1">{formatMeetingDateTime(inv.startsAt)}</p>}
            </div>
            <button onClick={(e) => handleDismiss(e, inv.callId)} className="text-white/40 hover:text-white p-1"><X size={14} /></button>
          </div>
          <button onClick={(e) => { e.stopPropagation(); handleJoin(inv.callId); }} className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-1.5 rounded-md transition-colors">Tham gia ngay</button>
        </div>
      ))}
    </div>
  );
  */
}