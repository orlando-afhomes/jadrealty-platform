import { z } from 'zod';

/**
 * Location verification - BE authoritative.
 * POST /registration/location-verify (API-SPECIFICATION #16, FEAT-014/015, BR-GEO-001..004).
 * GPS primary, IP fallback, PH-block. Accuracy/anti-spoof thresholds are TBD (OD-014/015) - not enforced for MVP.
 *
 * Frontend must NOT trust GPS alone; BE verifies and maps to program.
 * Mapping Philippines → Domestic else Abroad is isolated in one BE service (see api/v1/registration/location-verify.ts).
 */

// Request: GPS coordinates or IP fallback signal
export const locationVerificationRequestSchema = z.union([
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().positive().optional(),
    timestamp: z.string().datetime().optional(),
  }),
  z.object({
    ipFallback: z.literal(true),
  }),
  z.object({}).strict(), // empty -> treat as IP fallback
]);

export type LocationVerificationRequest = z.infer<typeof locationVerificationRequestSchema>;

// Response: BE-authoritative result
export const locationVerificationResponseSchema = z.object({
  verificationId: z.string().uuid(),
  verifiedCountryCode: z.string().length(2),
  detectedCountryCode: z.string().length(2).optional(),
  programId: z.string().min(1),
  programCode: z.enum(['DOMESTIC', 'ABROAD']).optional(),
  method: z.enum(['GPS', 'IP']),
  isPhilippines: z.boolean(),
  blocked: z.boolean(),
  requiresException: z.boolean(),
  accuracy: z.number().optional(),
});

export type LocationVerificationResponse = z.infer<typeof locationVerificationResponseSchema>;

/**
 * Philippine administrative reference - served by `GET /locations/*`
 * (PUBLIC, seeded from the official PSGC publication). Independent cities
 * (province NULL, e.g. Manila) appear as top-level entries alongside
 * provinces so the address hierarchy stays three levels deep.
 */
export const provinceRefSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['province', 'city']),
});

export type ProvinceRef = z.infer<typeof provinceRefSchema>;

export const cityRefSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  provinceCode: z.string().min(1).nullable(),
  kind: z.enum(['city', 'municipality']),
});

export type CityRef = z.infer<typeof cityRefSchema>;

export const barangayRefSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  cityCode: z.string().min(1),
});

export type BarangayRef = z.infer<typeof barangayRefSchema>;

export const provincesQuerySchema = z.object({ countryCode: z.string().length(2) });

export type ProvincesQuery = z.infer<typeof provincesQuerySchema>;

export const citiesQuerySchema = z.object({ provinceCode: z.string().min(1) });

export type CitiesQuery = z.infer<typeof citiesQuerySchema>;

export const barangaysQuerySchema = z.object({ cityCode: z.string().min(1) });

export type BarangaysQuery = z.infer<typeof barangaysQuerySchema>;
