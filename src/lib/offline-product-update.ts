/**
 * Offline-aware Product Update Helper
 * Handles product updates with offline queueing support
 */

import { wpAuthedRequest, WordPressAuthSession } from './wp-authed-request';
import { queueOperation } from './offline-queue';
import { WCProduct } from '@/types/woocommerce';

export interface ProductUpdateData {
  short_description?: string;
  description?: string;
  regular_price?: string;
  sale_price?: string;
  manage_stock?: boolean;
  stock_quantity?: number;
  categories?: { id: number }[];
  brands?: { id: number }[];
  images?: { id: number }[];
  meta_data?: { key: string; value: string }[];
}

export interface UpdateResult {
  success: boolean;
  product?: WCProduct;
  queued?: boolean;
  error?: string;
}

/**
 * Update a product with offline support
 * If offline and no images are being uploaded, queues the operation
 */
export async function updateProductOfflineAware(
  productId: number,
  productName: string,
  data: ProductUpdateData,
  session: WordPressAuthSession,
  hasNewImages: boolean = false
): Promise<UpdateResult> {
  const isOnline = navigator.onLine;

  // If online, proceed normally
  if (isOnline) {
    try {
      const updated = await wpAuthedRequest<WCProduct>(
        `/wc/v3/products/${productId}`,
        session,
        {
          method: 'PUT',
          body: JSON.stringify(data)
        }
      );
      return { success: true, product: updated };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update product' 
      };
    }
  }

  // If offline with new images, can't proceed
  if (hasNewImages) {
    return {
      success: false,
      error: 'Image uploads require an internet connection. Please try again when online.'
    };
  }

  // Queue the operation for later sync
  await queueOperation({
    type: 'UPDATE_PRODUCT',
    endpoint: `/wc/v3/products/${productId}`,
    method: 'PUT',
    body: data as Record<string, unknown>,
    storeUrl: session.storeUrl,
    description: `Update product: ${productName}`
  });

  return { success: true, queued: true };
}

/**
 * Update order status with offline support
 */
export async function updateOrderOfflineAware(
  orderId: number,
  newStatus: string,
  session: WordPressAuthSession
): Promise<UpdateResult> {
  const isOnline = navigator.onLine;

  if (isOnline) {
    try {
      const updated = await wpAuthedRequest<{ id: number; status: string }>(
        `/wc/v3/orders/${orderId}`,
        session,
        {
          method: 'PUT',
          body: JSON.stringify({ status: newStatus })
        }
      );
      return { success: true, product: updated as unknown as WCProduct };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update order'
      };
    }
  }

  // Queue for later
  await queueOperation({
    type: 'UPDATE_ORDER',
    endpoint: `/wc/v3/orders/${orderId}`,
    method: 'PUT',
    body: { status: newStatus },
    storeUrl: session.storeUrl,
    description: `Update order #${orderId} to ${newStatus}`
  });

  return { success: true, queued: true };
}
