import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';

export const useGetCalls = () => {
  const { user } = useUser();
  const client = useStreamVideoClient();
  const [calls, setCalls] = useState<Call[]>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!client || !user?.id) return;

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

    // If user has an email, also search by invitedEmailsStr
    if (userEmail) {
      baseFilter.$or.push({
        'custom.invitedEmailsStr': {
          $regex: `\\|${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|`,
        },
      });
    }

    const load = async () => {
      try {
        const { calls: fetched } = await client.queryCalls({
          sort: [{ field: 'starts_at', direction: -1 }],
          filter_conditions: baseFilter as never,
        });

        const email = user.primaryEmailAddress?.emailAddress
          ?.toLowerCase()
          .trim();

        const unique = new Map<string, Call>();
        for (const call of fetched ?? []) {
          // Deduplicate by id
          if (unique.has(call.id)) continue;

          // Client-side safety check for email invites
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
        console.error('[useGetCalls] query failed, fallback:', err);
        try {
          // Fallback: basic creator/member filter without email search
          const { calls: fb } = await client.queryCalls({
            sort: [{ field: 'starts_at', direction: -1 }],
            filter_conditions: {
              starts_at: { $exists: true },
              $or: [
                { created_by_user_id: uid },
                { members: { $in: [uid] } },
              ],
            } as never,
          });
          setCalls(fb ?? []);
        } catch (e2) {
          console.error('[useGetCalls] fallback failed:', e2);
        }
      } finally {
        setIsLoading(false);
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
