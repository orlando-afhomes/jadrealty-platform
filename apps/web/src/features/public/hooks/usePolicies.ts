import { useQuery } from '@tanstack/react-query';

import { getPolicies } from '../../../lib/api/endpoints';

/** `GET /policies` server-state (API-SPECIFICATION #69, PUBLIC, FEAT-062). */
export function usePolicies() {
  return useQuery({
    queryKey: ['policies'],
    queryFn: getPolicies,
  });
}
