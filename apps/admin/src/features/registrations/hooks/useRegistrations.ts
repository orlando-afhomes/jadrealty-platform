import { useQuery } from '@tanstack/react-query';

import { getRegistrations } from '../repositories/registrationRepository';

export function useRegistrations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin', 'registrations'],
    queryFn: getRegistrations,
    enabled: options?.enabled ?? true,
  });
}
