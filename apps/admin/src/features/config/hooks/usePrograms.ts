import { useQuery } from '@tanstack/react-query';

import { getPrograms } from '../services/config';

export function usePrograms() {
  return useQuery({ queryKey: ['admin', 'config', 'programs'], queryFn: getPrograms });
}
