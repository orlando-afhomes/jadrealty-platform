import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteTemplate } from '../services/vouchers';

export function useDeleteVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] }),
  });
}
