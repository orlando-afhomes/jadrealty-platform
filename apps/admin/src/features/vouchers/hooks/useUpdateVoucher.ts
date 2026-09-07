import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateTemplate, type UpdateTemplateInput } from '../services/vouchers';

export function useUpdateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTemplateInput }) =>
      updateTemplate(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] }),
  });
}
