import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getSuggestions } from '../../../lib/api/endpoints';

/**
 * International location suggestions for the registration address step
 * (non-PH countries only - the Philippines keeps its curated hierarchy).
 * The raw keystrokes debounce client-side (Nominatim policy-friendly on
 * top of the server's per-IP throttle); queries under 3 characters never
 * fire. Failures resolve to an empty list (`retry: false`) so the
 * region/city text fields always stay submittable as free text.
 */
const SUGGEST_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;
const REFERENCE_STALE_TIME = 60 * 60 * 1000;

export function useLocationSuggest(countryCode: string, query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);
  const term = debounced.trim();
  return useQuery({
    queryKey: ['locations', 'suggest', countryCode, term],
    queryFn: () => getSuggestions(countryCode, term),
    enabled: countryCode !== '' && countryCode !== 'PH' && term.length >= MIN_QUERY_LENGTH,
    staleTime: REFERENCE_STALE_TIME,
    retry: false,
  });
}
