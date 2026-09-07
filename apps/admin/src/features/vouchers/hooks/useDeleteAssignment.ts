import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteAssignment } from '../services/vouchers';

export function useDeleteAssignment(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] });
      qc.invalidateQueries({ queryKey: ['admin', 'vouchers', templateId, 'assignments'] });
    },
  });
}
