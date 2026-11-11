import { z } from 'zod'
import type { AudioEntry } from './backupFormat'

export const audioEntrySchema: z.ZodType<AudioEntry> = z.object({
  id: z.string(),
  cardId: z.string(),
  kind: z.enum(['tts', 'user_recording']),
  voice: z.string().nullable(),
  createdAt: z.number(),
  mimeType: z.string(),
  bytes: z.number(),
  sentence: z.string(),
  path: z.string(),
})
