import { useQuery } from '@tanstack/react-query';
import { getRoles } from '../services/roles';

export function useRoles() {
  return useQuery({ queryKey: ['admin', 'roles'], queryFn: getRoles });
}
