import { useQuery } from '@tanstack/react-query';

import { getRegistrations } from '../repositories/registrationRepository';

export function useRegistrations() {
  return useQuery({ queryKey: ['admin', 'registrations'], queryFn: getRegistrations });
}
