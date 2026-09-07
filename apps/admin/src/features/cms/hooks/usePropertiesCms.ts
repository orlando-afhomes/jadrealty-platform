import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getProperties, updateProperties } from '../services/cmsRepository';
import type { PropertiesContent } from '@jad/contracts';

export function usePropertiesCms() {
  return useQuery<PropertiesContent>({
    queryKey: ['cms', 'properties'],
    queryFn: getProperties,
  });
}

export function useUpdatePropertiesCms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: PropertiesContent) => updateProperties(draft),
    onSuccess: (data) => {
      qc.setQueryData(['cms', 'properties'], data);
    },
  });
}
