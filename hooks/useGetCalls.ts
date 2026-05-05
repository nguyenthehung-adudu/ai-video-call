import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';

export const useGetCalls = () => {
  const { user } = useUser();
  const client = useStreamVideoClient();
  const [calls, setCalls] = useState<Call[]>();
  const [isLoading, setIsLoading] = useState(false);

  // Stable refs to prevent dependency changes
  const clientRef = useRef(client);
  const userIdRef = useRef<string | undefined>(user?.id);
  const userEmailRef = useRef<string | undefined>(
    user?.primaryEmailAddress?.emailAddress?.toLowerCase().trim()
  );

  // Update refs when user changes (not on every render)
  if (user?.id !== userIdRef.current) userIdRef.current = user?.id;
  const emailRaw = user?.primaryEmailAddress?.emailAddress?.toLowerCase().trim();
  if (emailRaw !== userEmailRef.current) userEmailRef.current = emailRaw;

  // Ref to track if component is still mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Function to force refetch calls
  const forceRefetch = useCallback(async () => {
    const activeClient = clientRef.current;
    const uid = userIdRef.current;

    if (!activeClient || !uid) {
      console.log('⏳ [Calls] Cannot refetch: no client or user');
      return;
    }

    const userEmail = userEmailRef.current;

    type FilterCondition = Record<string, unknown>;
    const baseFilter: FilterCondition & {
      $or: Array<Record<string, unknown>>;
    } = {
      starts_at: { $exists: true },
      $or: [
        { created_by_user_id: uid },
        { members: { $in: [uid] } },
      ],
    };

    if (userEmail) {
      // Note: Stream API doesn't support $regex, so we only use $in for exact match
      // Additional filtering is done client-side below
      baseFilter.$or.push({
        'custom.invitedEmails': {
          $in: [userEmail],
        },
      });
    }

    const fetchCalls = async (): Promise<Call[]> => {
      const { calls: fetched } = await activeClient.queryCalls({
        sort: [{ field: 'starts_at', direction: -1 }],
        filter_conditions: baseFilter as never,
      });

      const email = userEmailRef.current;
      const unique = new Map<string, Call>();
      for (const call of fetched ?? []) {
        if (unique.has(call.id)) continue;

        const searchStr = call.state.custom?.invitedEmailsStr as string | undefined;
        const invitedEmailsArray = call.state.custom?.invitedEmails as string[] | undefined;
        const hostId = call.state.createdBy?.id;
        const isCreator = hostId === uid;
        const isMember = call.state.members?.some((m) => m.user_id === uid);
        const isInvitedStr = email && typeof searchStr === 'string' ? searchStr.includes(`|${email}|`) : false;
        const isInvitedArray = email && Array.isArray(invitedEmailsArray) ? invitedEmailsArray.includes(email) : false;

        if (isCreator || isMember || isInvitedStr || isInvitedArray) {
          unique.set(call.id, call);
        }
      }
      return [...unique.values()];
    };

    try {
      let result = await fetchCalls();
      // Retry up to 2 times with delay for newly created calls to be indexed
      if (result.length === 0) {
        for (let i = 0; i < 2; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          result = await fetchCalls();
          if (result.length > 0) break;
        }
      }

      if (isMountedRef.current) {
        setCalls(result);
      }
    } catch (error) {
      console.error('❌ [Calls] Refetch failed:', error);
    }
  }, []);

  useEffect(() => {
    const currentClient = clientRef.current;
    const uid = userIdRef.current;
    const userEmail = userEmailRef.current;

    if (!currentClient || !uid) {
      console.log('⏳ [Calls] Skipping query:', { hasClient: !!currentClient, hasUser: !!uid });
      return;
    }

    setIsLoading(true);

    type FilterCondition = Record<string, unknown>;
    const baseFilter: FilterCondition & {
      $or: Array<Record<string, unknown>>;
    } = {
      starts_at: { $exists: true },
      $or: [
        { created_by_user_id: uid },
        { members: { $in: [uid] } },
      ],
    };

    if (userEmail) {
      // Note: Stream API doesn't support $regex, so we only use $in for exact match
      // Additional filtering is done client-side below
      baseFilter.$or.push({
        'custom.invitedEmails': {
          $in: [userEmail],
        },
      });
    }

    const load = async () => {
      const activeClient = clientRef.current;
      if (!activeClient || !isMountedRef.current) {
        console.log('⏳ [Calls] Skipping load (no client or unmounted)');
        setIsLoading(false);
        return;
      }

      console.log('📞 [Calls] queryCalls START', {
        userId: uid,
        hasClient: !!activeClient,
        userEmail,
      });

      try {
        const queryStart = Date.now();

        const { calls: fetched } = await activeClient.queryCalls({
          sort: [{ field: 'starts_at', direction: -1 }],
          filter_conditions: baseFilter as never,
        });

        if (!isMountedRef.current) {
          console.log('⏳ [Calls] Component unmounted, skipping state update');
          return;
        }

        console.log('✅ [Calls] queryCalls SUCCESS', {
          count: fetched?.length ?? 0,
          time: Date.now() - queryStart + 'ms',
        });
        console.log('📞 [Calls] Fetched calls:', fetched?.map(c => ({
          id: c.id,
          startsAt: c.state.startsAt,
          description: c.state.custom?.description,
          invitedEmails: c.state.custom?.invitedEmails,
          invitedEmailsStr: c.state.custom?.invitedEmailsStr,
          createdBy: c.state.createdBy?.id,
        })));

        const email = userEmailRef.current;

        const unique = new Map<string, Call>();
        for (const call of fetched ?? []) {
          if (unique.has(call.id)) continue;

          const searchStr = call.state.custom?.invitedEmailsStr as
            | string
            | undefined;
          const invitedEmailsArray = call.state.custom?.invitedEmails as
            | string[]
            | undefined;
          const hostId = call.state.createdBy?.id;
          const isCreator = hostId === uid;
          const isMember = call.state.members?.some(
            (m) => m.user_id === uid,
          );
          // Check string format: |email|email|...
          const isInvitedStr =
            email && typeof searchStr === 'string'
              ? searchStr.includes(`|${email}|`)
              : false;
          // Also check array format: ['email1', 'email2']
          const isInvitedArray =
            email && Array.isArray(invitedEmailsArray)
              ? invitedEmailsArray.includes(email)
              : false;

          if (isCreator || isMember || isInvitedStr || isInvitedArray) {
            unique.set(call.id, call);
          }
        }

        setCalls([...unique.values()]);
      } catch (err) {
        if (!isMountedRef.current) return;

        console.error('❌ [Calls] queryCalls FAILED:', err);
        try {
          const fbStart = Date.now();
          console.log('🔄 [Calls] Trying fallback query...');

          const { calls: fb } = await activeClient.queryCalls({
            sort: [{ field: 'starts_at', direction: -1 }],
            filter_conditions: {
              starts_at: { $exists: true },
              $or: [
                { created_by_user_id: uid },
                { members: { $in: [uid] } },
              ],
            } as never,
          });

          if (!isMountedRef.current) return;

          console.log('✅ [Calls] Fallback SUCCESS', {
            count: fb?.length ?? 0,
            time: Date.now() - fbStart + 'ms',
          });

          // Apply same email filtering as main query
          const email = userEmailRef.current;
          const unique = new Map<string, Call>();
          for (const call of fb ?? []) {
            if (unique.has(call.id)) continue;
            const searchStr = call.state.custom?.invitedEmailsStr as string | undefined;
            const invitedEmailsArray = call.state.custom?.invitedEmails as string[] | undefined;
            const hostId = call.state.createdBy?.id;
            const isCreator = hostId === uid;
            const isMember = call.state.members?.some((m) => m.user_id === uid);
            const isInvitedStr = email && typeof searchStr === 'string' ? searchStr.includes(`|${email}|`) : false;
            const isInvitedArray = email && Array.isArray(invitedEmailsArray) ? invitedEmailsArray.includes(email) : false;
            if (isCreator || isMember || isInvitedStr || isInvitedArray) {
              unique.set(call.id, call);
            }
          }
          setCalls([...unique.values()]);
        } catch (e2) {
          if (!isMountedRef.current) return;
          console.error('❌ [Calls] Fallback FAILED:', e2);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void load();
  }, [client, user?.id]);

  // Refetch when component mounts (handles navigation from home → upcoming)
  useEffect(() => {
    void forceRefetch();
  }, [forceRefetch]);

  const endedCalls = useMemo(() => {
    if (!calls) return undefined;
    return calls
      .filter(({ state: { startsAt, endedAt } }) => {
        return !!endedAt || (!!startsAt && new Date(startsAt) < new Date());
      })
      .sort((a, b) => {
        const aTime = a.state.startsAt ? new Date(a.state.startsAt).getTime() : 0;
        const bTime = b.state.startsAt ? new Date(b.state.startsAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [calls]);

  const upcomingCalls = useMemo(() => {
    if (!calls) return undefined;
    return calls
      .filter(({ state: { startsAt } }) => {
        return !!startsAt && new Date(startsAt) > new Date();
      })
      .sort((a, b) => {
        const aTime = a.state.startsAt ? new Date(a.state.startsAt).getTime() : 0;
        const bTime = b.state.startsAt ? new Date(b.state.startsAt).getTime() : 0;
        return aTime - bTime;
      });
  }, [calls]);

  return { endedCalls, upcomingCalls, callRecordings: calls, isLoading, forceRefetch };
};
