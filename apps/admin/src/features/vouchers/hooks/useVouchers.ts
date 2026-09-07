import { useQuery } from '@tanstack/react-query';

import { emptyOnForbidden } from '../../../lib/api/errors';
import { getTemplates } from '../services/vouchers';

export function useVouchers() {
  return useQuery({
    queryKey: ['admin', 'vouchers'],
    queryFn: () => emptyOnForbidden(() => getTemplates()),
  });
}
