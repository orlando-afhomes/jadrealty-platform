import {
  barangayRefSchema,
  cityRefSchema,
  provinceRefSchema,
  publicConfigSchema,
} from '@jad/contracts';
import type { BarangayRef, CityRef, ProvinceRef, PublicConfig } from '@jad/contracts';

import { request, requestList } from '../../../lib/api/client';

/**
 * Public reference data for the member form (same endpoints `/register`
 * uses). Countries carry dial/phone metadata driving per-country phone
 * validation; the PSGC hierarchy drives the Philippine address selectors.
 * All reads go through the typed client - no ad-hoc fetch.
 */

/** GET /config/public - minimum age, genders, country + phone metadata. */
export function getMemberFormConfig(): Promise<PublicConfig> {
  return request('/config/public', publicConfigSchema);
}

/** GET /locations/provinces?countryCode=PH - provinces + independent cities. */
export function getFormProvinces(countryCode: string): Promise<ProvinceRef[]> {
  return requestList(
    `/locations/provinces?countryCode=${encodeURIComponent(countryCode)}`,
    provinceRefSchema,
  );
}

/** GET /locations/cities?provinceCode= - children of a province/city. */
export function getFormCities(provinceCode: string): Promise<CityRef[]> {
  return requestList(
    `/locations/cities?provinceCode=${encodeURIComponent(provinceCode)}`,
    cityRefSchema,
  );
}

/** GET /locations/barangays?cityCode= - barangays of a city/municipality. */
export function getFormBarangays(cityCode: string): Promise<BarangayRef[]> {
  return requestList(
    `/locations/barangays?cityCode=${encodeURIComponent(cityCode)}`,
    barangayRefSchema,
  );
}
