/**
 * Durable cache of the OpenRouter model catalogue in `ai_model_pricing`.
 *
 * The catalogue is small (Anthropic + OpenAI models only — tens of rows), so
 * we replace it wholesale on each refresh inside one transaction rather than
 * diffing. The DB copy is the cold-start fallback: if OpenRouter is
 * unreachable when the server boots, the last-known prices + context windows
 * still serve turns and the picker.
 */

import type { DbClient } from '../../db/client'
import type { ModelCatalogue, ModelCatalogueEntry } from './openrouterCatalogue'

interface PricingRow {
  pricing_key: string
  input_per_mtok: number | string
  output_per_mtok: number | string
  cache_read_per_mtok: number | string | null
  cache_write_per_mtok: number | string | null
  context_window: number | string | null
}

/** Load the cached catalogue. Returns null when the cache has never been
 *  populated, so the caller knows to block on a first live fetch. */
export async function loadCachedCatalogue(db: DbClient): Promise<ModelCatalogue | null> {
  const { rows } = await db<PricingRow>`
    select pricing_key, input_per_mtok, output_per_mtok,
           cache_read_per_mtok, cache_write_per_mtok, context_window
    from ai_model_pricing
  `
  if (rows.length === 0) return null

  const catalogue: ModelCatalogue = new Map()
  for (const row of rows) {
    catalogue.set(row.pricing_key, {
      prices: {
        inputPerMTok: Number(row.input_per_mtok),
        outputPerMTok: Number(row.output_per_mtok),
        cacheReadPerMTok: row.cache_read_per_mtok === null ? null : Number(row.cache_read_per_mtok),
        cacheWritePerMTok: row.cache_write_per_mtok === null ? null : Number(row.cache_write_per_mtok),
      },
      contextWindow: row.context_window === null ? null : Number(row.context_window),
    })
  }
  return catalogue
}

/** Replace the cached catalogue wholesale. */
export async function saveCachedCatalogue(db: DbClient, catalogue: ModelCatalogue): Promise<void> {
  await db.transaction(async (tx) => {
    await tx`delete from ai_model_pricing`
    for (const [key, entry] of catalogue) {
      await insertPricingRow(tx, key, entry)
    }
  })
}

async function insertPricingRow(db: DbClient, key: string, entry: ModelCatalogueEntry): Promise<void> {
  await db`
    insert into ai_model_pricing (
      pricing_key, input_per_mtok, output_per_mtok,
      cache_read_per_mtok, cache_write_per_mtok, context_window
    ) values (
      ${key}, ${entry.prices.inputPerMTok}, ${entry.prices.outputPerMTok},
      ${entry.prices.cacheReadPerMTok}, ${entry.prices.cacheWritePerMTok}, ${entry.contextWindow}
    )
  `
}
