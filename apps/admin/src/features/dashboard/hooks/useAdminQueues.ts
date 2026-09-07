import { useQuery } from '@tanstack/react-query';

import { getAdminQueues } from '../services/queues';

export function useAdminQueues() {
  return useQuery({ queryKey: ['admin', 'queues'], queryFn: getAdminQueues });
}
