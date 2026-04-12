'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Bell, X, User, Trash2, AlertTriangle } from 'lucide-react';
import { formatMeetingDateTime } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Invitation {
  id: string;
  callId: string;
  meetingName: string;
  hostName: string;
  hostAvatar?: string;
  type: 'scheduled' | 'instant';
  scheduledAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    invitationId: string;
    meetingName: string;
  }>({ open: false, invitationId: '', meetingName: '' });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<string>('');

  const fetchInvitations = useCallback(async () => {
    if (!isLoaded || !user) return;

    const email = user.primaryEmailAddress?.emailAddress?.toLowerCase().trim();
    if (!email) return;

    try {
      const res = await fetch(`/api/invitations?email=${encodeURIComponent(email)}`);
      const data = await res.json();

      if (data.invitations) {
        // Only update state if data actually changed
        const newData = JSON.stringify(data.invitations);
        if (newData === lastDataRef.current) return;
        lastDataRef.current = newData;

        const newInvitations: Invitation[] = data.invitations.map((inv: {
          id: string;
          callId: string;
          meetingName: string;
          hostName: string;
          hostAvatar?: string;
          type?: string;
          scheduledAt?: string | null;
          createdAt: string;
        }) => ({
          id: inv.id,
          callId: inv.callId,
          meetingName: inv.meetingName || 'Cuộc họp',
          hostName: inv.hostName || 'Người chủ phòng',
          hostAvatar: inv.hostAvatar,
          type: (inv.type as 'scheduled' | 'instant') || 'scheduled',
          scheduledAt: inv.scheduledAt || null,
          createdAt: inv.createdAt,
        }));

        setInvitations(newInvitations);
        setUnreadCount(newInvitations.length);
      }
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
    }
  }, [isLoaded, user]);

  // Poll for new invitations every 10 seconds
  useEffect(() => {
    if (!isLoaded || !user) return;

    fetchInvitations();

    intervalRef.current = setInterval(fetchInvitations, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLoaded, user, fetchInvitations]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleJoin = (callId: string) => {
    setIsOpen(false);
    router.push(`/meeting/${callId}`);
  };

  const handleRequestDelete = (e: React.MouseEvent, invitationId: string, meetingName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDelete({ open: true, invitationId, meetingName });
  };

  const handleConfirmDelete = async () => {
    const { invitationId } = confirmDelete;
    if (!invitationId) return;

    try {
      await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invitationId }),
      });
    } catch (error) {
      console.error('Failed to delete invitation:', error);
    }

    setInvitations((prev) => {
      const newList = prev.filter((inv) => inv.id !== invitationId);
      setUnreadCount(newList.length);
      return newList;
    });

    lastDataRef.current = JSON.stringify(invitations.filter(inv => inv.id !== invitationId));
    setConfirmDelete({ open: false, invitationId: '', meetingName: '' });
  };

  const handleCancelDelete = () => {
    setConfirmDelete({ open: false, invitationId: '', meetingName: '' });
  };

  if (!isLoaded || !user) return null;

  return (
    <>
    <div className="relative" ref={dropdownRef}>
      {/* Bell icon with badge */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchInvitations();
        }}
        className="relative p-2 rounded-full hover:bg-dark-3 transition-colors"
        aria-label="Thông báo lời mời"
      >
        <Bell size={22} className="text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-1 border border-dark-3 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-3">
            <span className="text-white font-medium">Lời mời tham gia</span>
            <span className="text-purple-400 text-sm">
              {invitations.length} cuộc họp
            </span>
          </div>

          {/* Invitations list */}
          <div className="max-h-96 overflow-y-auto">
            {invitations.length === 0 ? (
              <div className="px-4 py-6 text-center text-white/50 text-sm">
                Không có lời mời nào
              </div>
            ) : (
              invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 border-b border-dark-3 hover:bg-dark-2 cursor-pointer transition-colors"
                  onClick={() => handleJoin(inv.callId)}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {inv.hostAvatar ? (
                        <img
                          src={inv.hostAvatar}
                          alt={inv.hostName}
                          className="w-10 h-10 rounded-full object-cover border border-dark-3"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                          <User size={18} className="text-purple-400" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium text-sm truncate">
                          {inv.meetingName}
                        </p>
                        {inv.type === 'instant' && (
                          <span className="px-1.5 py-0.5 bg-green-600/20 border border-green-500/30 rounded text-green-400 text-[10px] font-medium">
                            Đang diễn ra
                          </span>
                        )}
                      </div>
                      <p className="text-white/60 text-xs mt-1">
                        {inv.type === 'instant'
                          ? `${inv.hostName} đã mời bạn tham gia ngay vào ${inv.meetingName}`
                          : inv.scheduledAt
                            ? `${inv.hostName} đã mời bạn tham gia ${inv.meetingName} vào lúc ${formatMeetingDateTime(inv.scheduledAt)}`
                            : `${inv.hostName} đã mời bạn tham gia`
                        }
                      </p>
                    </div>

                    {/* Dismiss & Delete buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleRequestDelete(e, inv.id, inv.meetingName)}
                        className="text-white/40 hover:text-red-400 p-1 transition-colors"
                        aria-label="Xóa lời mời"
                        title="Xóa lời mời"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Join button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoin(inv.callId);
                    }}
                    className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 rounded-md transition-colors flex items-center justify-center gap-2"
                  >
                    Tham gia ngay
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>

    <AlertDialog open={confirmDelete.open} onOpenChange={(open) => !open && handleCancelDelete()}>
      <AlertDialogContent className="bg-dark-1 border-dark-3 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={20} />
            Xác nhận xóa lời mời
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/60">
            {"Bạn có chắc chắn muốn xóa lời mời tham gia cuộc họp \""}
            <strong className="text-white">{confirmDelete.meetingName}</strong>
            {"\" không?"}
            <br />
            <span className="text-yellow-500 text-sm">Hành động này không thể hoàn tác.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <AlertDialogCancel className="bg-dark-3 text-white hover:bg-dark-2 border-dark-3">
            Hủy bỏ
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Xóa lời mời
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}