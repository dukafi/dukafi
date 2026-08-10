/**
 * useCommerceData — loads the Commerce workspace's products + collections
 * once and exposes a `refresh` callback. Individual sections own their own
 * mutation calls (via `../api`) and call `refresh` afterward, the same
 * division of responsibility as the Users workspace's per-tab components.
 */
import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '@core/utils/errorMessage'
import { commerceApi } from '../api'
import type { Collection, Order, Plugin, Product } from '../types'

export interface CommerceData {
  products: Product[]
  collections: Collection[]
  orders: Order[]
  plugins: Plugin[]
  loading: boolean
  error: string | null
  setError: (error: string | null) => void
  refresh: () => Promise<void>
}

export function useCommerceData(): CommerceData {
  const [products, setProducts] = useState<Product[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [productsResult, collectionsResult, ordersResult, pluginsResult] = await Promise.all([
        commerceApi.listProducts(),
        commerceApi.listCollections(),
        commerceApi.listOrders(),
        commerceApi.listPlugins(),
      ])
      setProducts(productsResult.products)
      setCollections(collectionsResult.collections)
      setOrders(ordersResult.orders)
      setPlugins(pluginsResult.plugins)
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

  return { products, collections, orders, plugins, loading, error, setError, refresh }
}
