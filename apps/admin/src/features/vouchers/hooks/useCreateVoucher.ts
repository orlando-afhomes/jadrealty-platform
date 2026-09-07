import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createTemplate, type CreateTemplateInput } from '../services/vouchers';

export function useCreateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => createTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] }),
  });
}
