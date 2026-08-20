import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { wpAuthedRequest } from '@/lib/wp-authed-request';
import { WCCategory, WCBrand } from '@/types/woocommerce';

interface ProductOptions {
  categories: WCCategory[];
  brands: WCBrand[];
  attributes: WCAttribute[];
  isLoading: boolean;
  error: string | null;
}

export function useProductOptions(): ProductOptions {
  const { session } = useAuth();
  const [categories, setCategories] = useState<WCCategory[]>([]);
  const [brands, setBrands] = useState<WCBrand[]>([]);
  const [attributes, setAttributes] = useState<WCAttribute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOptions() {
      if (!session) return;
      
      try {
        const [categoriesData, brandsData, attributesData] = await Promise.all([
          wpAuthedRequest<WCCategory[]>(
            '/wc/v3/products/categories?per_page=100',
            session
          ),
          wpAuthedRequest<WCBrand[]>(
            '/wp/v2/product_brand?per_page=100',
            session
          ).catch(() => [] as WCBrand[]), // Brands might not exist on all stores
          wpAuthedRequest<WCAttribute[]>(
            '/wc/v3/products/attributes?per_page=100',
            session
          ).catch(() => [] as WCAttribute[]),
        ]);
        
        setCategories(categoriesData);
        setBrands(brandsData);
        setAttributes(attributesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load options');
      } finally {
        setIsLoading(false);
      }
    }

    fetchOptions();
  }, [session]);

  return { categories, brands, attributes, isLoading, error };
}

/**
 * Build a hierarchical category list for display
 * Returns categories with indentation based on parent-child relationships
 */
export function buildCategoryTree(categories: WCCategory[]): { id: number; name: string; depth: number }[] {
  const result: { id: number; name: string; depth: number }[] = [];
  
  // Find root categories (no parent or parent = 0)
  const roots = categories.filter(c => !c.parent || c.parent === 0);
  
  function addCategory(category: WCCategory, depth: number) {
    result.push({ id: category.id, name: category.name, depth });
    
    // Find children
    const children = categories.filter(c => c.parent === category.id);
    children.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const child of children) {
      addCategory(child, depth + 1);
    }
  }
  
  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const root of roots) {
    addCategory(root, 0);
  }
  
  return result;
}

/**
 * Get a category and all its parent categories
 * Returns array of category IDs including the selected one and all ancestors
 */
export function getCategoryWithParents(categoryId: number, categories: WCCategory[]): number[] {
  const categoryMap = new Map(categories.map(c => [c.id, c]));
  const result: number[] = [];
  
  let current = categoryMap.get(categoryId);
  while (current) {
    result.push(current.id);
    if (current.parent && current.parent !== 0) {
      current = categoryMap.get(current.parent);
    } else {
      break;
    }
  }
  
  return result;
}

export function useAttributeTerms(attributeId: number | null) {
  const { session } = useAuth();
  const [terms, setTerms] = useState<WCTerm[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchTerms() {
      if (!session || !attributeId) {
        setTerms([]);
        return;
      }
      
      setIsLoading(true);
      try {
        const data = await wpAuthedRequest<WCTerm[]>(
          `/wc/v3/products/attributes/${attributeId}/terms?per_page=100`,
          session
        );
        setTerms(data || []);
      } catch (err) {
        console.error('Failed to load terms', err);
        setTerms([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTerms();
  }, [session, attributeId]);

  return { terms, isLoading };
}
