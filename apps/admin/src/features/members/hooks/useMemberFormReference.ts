import { useQuery } from '@tanstack/react-query';

import {
  getFormBarangays,
  getFormCities,
  getFormProvinces,
  getMemberFormConfig,
} from '../services/reference';

/**
 * Reference queries for the Create/Edit Member dialog - the same public
 * config + PSGC hierarchy `/register` uses (hour-long cache, no retries on
 * failure so errors surface as retryable alerts instead of spinners).
 * The dialogs stay mounted while closed, so every query takes an `enabled`
 * flag - the dialog passes its `open` state to avoid fetching reference
 * data on every Members page visit.
 */
export function useMemberFormConfig(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'member-form', 'config'],
    queryFn: getMemberFormConfig,
    enabled,
    staleTime: 3600000,
    retry: false,
  });
}

export function useMemberFormProvinces(countryCode: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'member-form', 'provinces', countryCode],
    queryFn: () => getFormProvinces(countryCode),
    enabled: enabled && countryCode === 'PH',
    staleTime: 3600000,
    retry: false,
  });
}

export function useMemberFormCities(provinceCode: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'member-form', 'cities', provinceCode],
    queryFn: () => getFormCities(provinceCode),
    enabled: enabled && provinceCode.length > 0,
    staleTime: 3600000,
    retry: false,
  });
}

export function useMemberFormBarangays(cityCode: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'member-form', 'barangays', cityCode],
    queryFn: () => getFormBarangays(cityCode),
    enabled: enabled && cityCode.length > 0,
    staleTime: 3600000,
    retry: false,
  });
}
