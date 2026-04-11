import { useEffect, useState, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';

export const useGetCalls = () => {
  const { user } = useUser();
  const client = useStreamVideoClient();
  const [calls, setCalls] = useState<Call[]>();
  const [isLoading, setIsLoading] = useState(false);

  // Ref to always have latest client in async functions
  const clientRef = useRef(client);
  clientRef.current = client;

  // Ref to track if component is still mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const currentClient = clientRef.current;

    if (!currentClient || !user?.id) {
      console.log('⏳ [Calls] Skipping query:', { hasClient: !!currentClient, hasUser: !!user?.id });
      return;
    }

    setIsLoading(true);

    const uid = user.id;
    const userEmail = user.primaryEmailAddress?.emailAddress
      ?.toLowerCase()
      .trim();

    const baseFilter = {
      starts_at: { $exists: true },
      $or: [
        { created_by_user_id: uid },
        { members: { $in: [uid] } },
      ] as object[],
    };

    if (userEmail) {
      baseFilter.$or.push({
        'custom.invitedEmailsStr': {
          $regex: `\\|${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|`,
        },
      });
    }

    const load = async () => {
      // Check if still mounted and client is valid
      const activeClient = clientRef.current;
      if (!activeClient || !isMountedRef.current) {
        console.log('⏳ [Calls] Skipping load (no client or unmounted)');
        setIsLoading(false);
        return;
      }

      console.log('📞 [Calls] queryCalls START', {
        userId: uid,
        hasClient: !!activeClient,
      });

      try {
        const queryStart = Date.now();

        const { calls: fetched } = await activeClient.queryCalls({
          sort: [{ field: 'starts_at', direction: -1 }],
          filter_conditions: baseFilter as never,
        });

        // Check if still mounted after async operation
        if (!isMountedRef.current) {
          console.log('⏳ [Calls] Component unmounted, skipping state update');
          return;
        }

        console.log('✅ [Calls] queryCalls SUCCESS', {
          count: fetched?.length ?? 0,
          time: Date.now() - queryStart + 'ms',
        });

        const email = user.primaryEmailAddress?.emailAddress
          ?.toLowerCase()
          .trim();

        const unique = new Map<string, Call>();
        for (const call of fetched ?? []) {
          if (unique.has(call.id)) continue;

          const searchStr = call.state.custom?.invitedEmailsStr as
            | string
            | undefined;
          const hostId = call.state.createdBy?.id;
          const isCreator = hostId === uid;
          const isMember = call.state.members?.some(
            (m) => m.user_id === uid,
          );
          const isInvited =
            email && typeof searchStr === 'string'
              ? searchStr.includes(`|${email}|`)
              : false;

          if (isCreator || isMember || isInvited) {
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

          setCalls(fb ?? []);
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
  }, [
    client,
    user?.id,
    user?.primaryEmailAddress?.emailAddress,
  ]);

  const now = new Date();

  const endedCalls = calls?.filter(({ state: { startsAt, endedAt } }) => {
    return !!endedAt || (!!startsAt && new Date(startsAt) < now);
  });

  const upcomingCalls = calls?.filter(({ state: { startsAt } }) => {
    return !!startsAt && new Date(startsAt) > now;
  });

  return { endedCalls, upcomingCalls, callRecordings: calls, isLoading };
};
