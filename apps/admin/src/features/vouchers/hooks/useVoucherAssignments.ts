import { useQuery } from '@tanstack/react-query';

import { emptyOnForbidden } from '../../../lib/api/errors';
import { getAllAssignments, getAssignments } from '../services/vouchers';

export function useVoucherAssignments(templateId: string) {
  return useQuery({
    queryKey: ['admin', 'vouchers', templateId, 'assignments'],
    queryFn: () => emptyOnForbidden(() => getAssignments(templateId)),
    enabled: templateId.length > 0,
  });
}

/** All assignments across templates — backs the per-template counts on the list page. */
export function useAllVoucherAssignments() {
  return useQuery({
    queryKey: ['admin', 'vouchers', 'assignments'],
    queryFn: () => emptyOnForbidden(() => getAllAssignments()),
  });
}
