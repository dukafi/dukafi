/**
 * useCommerceData — loads the Commerce workspace's products + collections
 * once and exposes a `refresh` callback. Individual sections own their own
 * mutation calls (via `../api`) and call `refresh` afterward, the same
 * division of responsibility as the Users workspace's per-tab components.
 */
import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import type { Collection, Product } from '../types'

export interface CommerceData {
  products: Product[]
  collections: Collection[]
  loading: boolean
  error: string | null
  setError: (error: string | null) => void
  refresh: () => Promise<void>
}

export function useCommerceData(): CommerceData {
  const [products, setProducts] = useState<Product[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [productsResult, collectionsResult] = await Promise.all([
        commerceApi.listProducts(),
        commerceApi.listCollections(),
      ])
      setProducts(productsResult.products)
      setCollections(collectionsResult.collections)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the catalog'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { products, collections, loading, error, setError, refresh }
}
