import { useState, FormEvent, useRef, ChangeEvent, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { wpAuthedRequest } from '@/lib/wp-authed-request';
import { uploadToWordPress, uploadMultipleToWordPress } from '@/lib/wp-media-upload';
import { resizeImage, resizeImages, PRODUCT_IMAGE_SIZE } from '@/lib/image-resize';
import { textToHtml, htmlToText } from '@/lib/html-utils';
import { purgeProductCache } from '@/lib/cache-purge';
import { emitProductUpdate } from '@/lib/product-events';
import { useProductOptions, buildCategoryTree, getCategoryWithParents } from '@/hooks/use-product-options';
import { WCProduct, WCVariation } from '@/types/woocommerce';
import { X, Loader2, Package, Save, ToggleLeft, ToggleRight, Image, Images, Upload, Trash2, Plus, ChevronDown, Tag, FolderTree, Layers, CheckCircle2, ExternalLink } from 'lucide-react';
import { AttributesUI, AttributeData } from './AttributesUI';

interface QuickEditModalProps {
  product: WCProduct;
  onClose: () => void;
  onSave: (updated: WCProduct) => void;
}

interface ExistingImage {
  id: number;
  src: string;
  isNew?: false;
}

interface NewImage {
  file: File;
  preview: string;
  isNew: true;
}

type ProductImage = ExistingImage | NewImage;

export function QuickEditModal({ product, onClose, onSave }: QuickEditModalProps) {
  const { session } = useAuth();
  const { categories, brands, attributes: globalAttributes, isLoading: optionsLoading } = useProductOptions();
  const [productName, setProductName] = useState(product.name || '');
  const [shortDescription, setShortDescription] = useState(() => htmlToText(product.short_description || ''));
  const [description, setDescription] = useState(() => htmlToText(product.description || ''));
  const [regularPrice, setRegularPrice] = useState(product.regular_price || '');
  const [salePrice, setSalePrice] = useState(product.sale_price || '');
  const [productType, setProductType] = useState<'simple' | 'variable' | 'external' | 'downloadable'>(
    product.downloadable ? 'downloadable' : (product.type as 'simple' | 'variable' | 'external' | 'downloadable') || 'simple'
  );
  const [externalUrl, setExternalUrl] = useState(product.external_url || '');
  const [buttonText, setButtonText] = useState(product.button_text || 'Buy Product');
  const [downloadFileName, setDownloadFileName] = useState(product.downloads?.[0]?.name || '');
  const [downloadFileUrl, setDownloadFileUrl] = useState(product.downloads?.[0]?.file || '');
  const [downloadableFile, setDownloadableFile] = useState<File | null>(null);
  const downloadableFileRef = useRef<HTMLInputElement>(null);

  const [manageStock, setManageStock] = useState(product.manage_stock);
  const [stockQuantity, setStockQuantity] = useState(
    product.stock_quantity?.toString() || '0'
  );
  const [isOutOfStock, setIsOutOfStock] = useState(product.stock_status === 'outofstock');
  const [selectedCategories, setSelectedCategories] = useState<number[]>(
    () => (product.categories || []).map((c) => c.id)
  );
  const [selectedBrand, setSelectedBrand] = useState<number | null>(
    () => product.brands?.[0]?.id || null
  );

  const [variations, setVariations] = useState<Partial<WCVariation>[]>([]);
  const [isLoadingVariations, setIsLoadingVariations] = useState(product.type === 'variable');
  const [attributesSaved, setAttributesSaved] = useState(false);
  const [attributes, setAttributes] = useState<AttributeData[]>(
    () => (product.attributes || []).map(a => ({ id: a.id, name: a.name, options: a.options }))
  );
  const [successProduct, setSuccessProduct] = useState<WCProduct | null>(null);

  function generateVariations() {
    if (attributes.length === 0) return;
    
    // Parse options
    const parsedAttributes = attributes.map(a => ({
      id: a.id,
      name: a.name,
      options: a.options
    })).filter(a => a.name.trim() && a.options.length > 0);

    if (parsedAttributes.length === 0) return;

    // Cartesian product
    const combine = (attrs: typeof parsedAttributes): {id: number, name: string, option: string}[][] => {
      if (attrs.length === 0) return [[]];
      const first = attrs[0];
      const rest = combine(attrs.slice(1));
      return first.options.flatMap(opt => rest.map(r => [{id: first.id, name: first.name, option: opt}, ...r]));
    };

    const combinations = combine(parsedAttributes);
    
    // Auto-generate only variations that do not already exist
    setVariations(prev => {
      const newVariations = combinations.filter(combo => {
        return !prev.some(v => {
          if (!v.attributes || v.attributes.length !== combo.length) return false;
          return combo.every(c => v.attributes!.some(va => va.name === c.name && va.option === c.option));
        });
      }).map((combo, index) => ({
        id: -(Date.now() + index), // temp id
        regular_price: '',
        sale_price: '',
        manage_stock: false,
        stock_quantity: 0,
        attributes: combo.map(c => ({ id: c.id || 0, name: c.name, option: c.option }))
      }));

      return [...prev, ...newVariations];
    });
  }

  useEffect(() => {
    if (product.type === 'variable' && session) {
      async function fetchVariations() {
        try {
          const data = await wpAuthedRequest<WCVariation[]>(`/wc/v3/products/${product.id}/variations?per_page=100`, session);
          setVariations(data || []);
        } catch (err) {
          console.error('Failed to fetch variations:', err);
        } finally {
          setIsLoadingVariations(false);
        }
      }
      fetchVariations();
    }
  }, [product.id, product.type, session]);

  // Image state - combine existing and new images
  const [images, setImages] = useState<ProductImage[]>(() =>
    (product.images || []).map((img) => ({ id: img.id, src: img.src, isNew: false as const }))
  );
  const [newGalleryImages, setNewGalleryImages] = useState<NewImage[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [error, setError] = useState('');

  const categoryTree = buildCategoryTree(categories);

  const productImageRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function handleProductImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setIsResizing(true);
        // Resize image to 600x600
        const resizedFile = await resizeImage(file, PRODUCT_IMAGE_SIZE);

        const newImage: NewImage = {
          file: resizedFile,
          preview: URL.createObjectURL(resizedFile),
          isNew: true
        };
        // Replace first image or add as first
        setImages((prev) => {
          if (prev.length > 0 && prev[0].isNew) {
            URL.revokeObjectURL((prev[0] as NewImage).preview);
          }
          return [newImage, ...prev.filter((_, i) => i !== 0 || !prev[0].isNew)];
        });
      } catch (err) {
        setError('Failed to process image');
      } finally {
        setIsResizing(false);
      }
    }
  }

  async function handleGallerySelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      setIsResizing(true);
      // Resize all images to 600x600
      const resizedFiles = await resizeImages(files, PRODUCT_IMAGE_SIZE);

      const newPreviews = resizedFiles.map((file): NewImage => ({
        file,
        preview: URL.createObjectURL(file),
        isNew: true
      }));
      setNewGalleryImages((prev) => [...prev, ...newPreviews]);
    } catch (err) {
      setError('Failed to process images');
    } finally {
      setIsResizing(false);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const img = prev[index];
      if (img.isNew) {
        URL.revokeObjectURL(img.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeNewGalleryImage(index: number) {
    setNewGalleryImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;

    setIsSaving(true);
    setError('');

    try {
      const finalImages: {id: number;}[] = [];

      // Process existing images (keep their IDs) and upload new ones
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img.isNew) {
          setUploadProgress('Uploading product image...');
          const uploaded = await uploadToWordPress(img.file, session);
          finalImages.push({ id: uploaded.id });
        } else {
          finalImages.push({ id: img.id });
        }
      }

      // Upload new gallery images
      if (newGalleryImages.length > 0) {
        setUploadProgress(`Uploading gallery (0/${newGalleryImages.length})...`);
        const galleryFiles = newGalleryImages.map((img) => img.file);
        const uploadedGallery = await uploadMultipleToWordPress(
          galleryFiles,
          session,
          (uploaded, total) => {
            setUploadProgress(`Uploading gallery (${uploaded}/${total})...`);
          }
        );
        uploadedGallery.forEach((media) => {
          finalImages.push({ id: media.id });
        });
      }

      setUploadProgress('Saving product...');

      const body: Record<string, unknown> = {
        name: productName.trim(),
        type: productType === 'downloadable' ? 'simple' : productType,
        stock_status: isOutOfStock ? 'outofstock' : 'instock',
        short_description: textToHtml(shortDescription),
        description: textToHtml(description),
        images: finalImages,
        meta_data: [
          { key: '_wp_page_template', value: 'elementor_canvas' }
        ],
      };

      if (productType === 'simple' || productType === 'downloadable') {
        body.regular_price = regularPrice || '';
        body.sale_price = salePrice || '';
        
        if (productType === 'downloadable') {
          body.downloadable = true;
          
          let finalDownloadUrl = downloadFileUrl;
          let finalDownloadName = downloadFileName;
          
          if (downloadableFile) {
            setUploadProgress('Uploading downloadable file...');
            const uploadedFile = await uploadToWordPress(downloadableFile, session);
            finalDownloadUrl = uploadedFile.src;
            if (!finalDownloadName) {
              finalDownloadName = downloadableFile.name;
            }
          }

          if (finalDownloadName && finalDownloadUrl) {
            body.downloads = [{ name: finalDownloadName, file: finalDownloadUrl }];
          } else {
            body.downloads = [];
          }
        } else {
          body.downloadable = false;
          body.manage_stock = manageStock;
          if (manageStock) {
            body.stock_quantity = parseInt(stockQuantity, 10) || 0;
          }
        }
      } else if (productType === 'external') {
        body.external_url = externalUrl;
        body.button_text = buttonText;
        body.manage_stock = false;
      } else if (productType === 'variable') {
        // Variable product attributes
        const parsedAttributes = attributes.map((a, index) => ({
          id: a.id,
          name: a.name,
          position: index,
          visible: true,
          variation: true,
          options: a.options
        })).filter(a => a.name.trim() && a.options.length > 0);
        body.attributes = parsedAttributes;
      }

      if (selectedCategories.length > 0) {
        body.categories = selectedCategories.map((id) => ({ id }));
      }

      if (selectedBrand) {
        body.brands = [{ id: selectedBrand }];
      }

      console.log('📤 Sending product update:', {
        id: product.id,
        regular_price: regularPrice,
        sale_price: salePrice,
        body: body
      });

      const updated = await wpAuthedRequest<WCProduct>(
        `/wc/v3/products/${product.id}`,
        session,
        {
          method: 'PUT',
          body: JSON.stringify(body)
        }
      );

      // Verify the update was applied
      console.log('✅ Product saved - Response from WooCommerce:', {
        id: updated.id,
        name: updated.name,
        regular_price: updated.regular_price,
        sale_price: updated.sale_price,
        on_sale: updated.on_sale
      });

      // Check if values actually changed
      if (updated.regular_price !== regularPrice) {
        console.warn('⚠️ Regular price mismatch! Sent:', regularPrice, 'Got:', updated.regular_price);
      }
      if (updated.sale_price !== salePrice) {
        console.warn('⚠️ Sale price mismatch! Sent:', salePrice, 'Got:', updated.sale_price);
      }

      if (product.type === 'variable' && variations.length > 0) {
        setUploadProgress('Saving variations...');
        
        const toCreate = variations.filter(v => (v.id || 0) < 0).map(v => ({
          regular_price: v.regular_price || '0',
          sale_price: v.sale_price || '',
          manage_stock: v.manage_stock || false,
          stock_quantity: v.manage_stock ? (parseInt(v.stock_quantity as any, 10) || 0) : null,
          attributes: v.attributes
        }));
        
        const toUpdate = variations.filter(v => (v.id || 0) > 0).map(v => ({
          id: v.id,
          regular_price: v.regular_price,
          sale_price: v.sale_price,
          manage_stock: v.manage_stock,
          stock_quantity: v.manage_stock ? (parseInt(v.stock_quantity as any, 10) || 0) : null
        }));

        const batchPayload: any = {};
        if (toCreate.length > 0) batchPayload.create = toCreate;
        if (toUpdate.length > 0) batchPayload.update = toUpdate;

        if (Object.keys(batchPayload).length > 0) {
          await wpAuthedRequest(`/wc/v3/products/${product.id}/variations/batch`, session, {
            method: 'POST',
            body: JSON.stringify(batchPayload)
          });
        }
      }

      // Purge LiteSpeed and WooCommerce cache
      setUploadProgress('Clearing cache...');
      await purgeProductCache(session, updated.id);

      // Notify other components (like Dashboard) that products changed
      emitProductUpdate('quick-edit');
      onSave(updated);
      setSuccessProduct(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
      setUploadProgress('');
    }
  }

  const mainImage = images[0];
  const galleryImages = images.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card rounded-t-3xl p-6 safe-area-bottom animate-slide-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {successProduct ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Changes Saved!</h2>
            <p className="text-sm text-muted-foreground mb-8">
              {successProduct.name} has been successfully updated on your store.
            </p>
            <div className="flex flex-col w-full gap-3">
              {successProduct.permalink && (
                <button
                  type="button"
                  onClick={() => window.open(successProduct.permalink, '_blank')}
                  className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="w-5 h-5" /> View Product
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 border border-border text-foreground font-medium rounded-xl hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {mainImage ? (
                <img
                  src={mainImage.isNew ? mainImage.preview : mainImage.src}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Edit Product</h2>
              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                {product.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors -mr-2 -mt-2"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Product Image */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <Image className="w-4 h-4" />
                Product Image
                <span className="text-xs text-muted-foreground font-normal">(auto-resized to 600×600)</span>
                {isResizing && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              </span>
            </label>
            <input
              ref={productImageRef}
              type="file"
              accept="image/*"
              onChange={handleProductImageSelect}
              className="hidden"
            />

            {mainImage ? (
              <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-border">
                <img
                  src={mainImage.isNew ? mainImage.preview : mainImage.src}
                  alt="Product"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => productImageRef.current?.click()}
                    className="p-2 rounded-lg bg-white/90 text-foreground hover:bg-white transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(0)}
                    className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => productImageRef.current?.click()}
                className="w-32 h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Upload className="w-6 h-6" />
                <span className="text-xs">Upload</span>
              </button>
            )}
          </div>

          {/* Gallery Images */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <Images className="w-4 h-4" />
                Product Gallery
              </span>
            </label>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGallerySelect}
              className="hidden"
            />

            <div className="flex flex-wrap gap-2">
              {/* Existing gallery images */}
              {galleryImages.map((img, index) => (
                <div
                  key={img.isNew ? `new-${index}` : `existing-${img.id}`}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group"
                >
                  <img
                    src={img.isNew ? img.preview : img.src}
                    alt={`Gallery ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index + 1)}
                    className="absolute top-0.5 right-0.5 p-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {/* New gallery images to upload */}
              {newGalleryImages.map((img, index) => (
                <div
                  key={`upload-${index}`}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-primary/50 group"
                >
                  <img
                    src={img.preview}
                    alt={`New ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-primary/10" />
                  <button
                    type="button"
                    onClick={() => removeNewGalleryImage(index)}
                    className="absolute top-0.5 right-0.5 p-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[10px]">Add</span>
              </button>
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Enter product name"
            />
          </div>

          {/* Product Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Product Type
              </span>
            </label>
            <div className="relative">
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value as any)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer"
              >
                <option value="simple">Simple Product</option>
                <option value="variable">Variable Product</option>
                <option value="external">Affiliate Product</option>
                <option value="downloadable">Downloadable Product</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <FolderTree className="w-4 h-4" />
                Category
              </span>
            </label>
            <div className="relative">
              <select
                value={selectedCategories[0] || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : null;
                  if (value) {
                    // Auto-select parent categories
                    const withParents = getCategoryWithParents(value, categories);
                    setSelectedCategories(withParents);
                  } else {
                    setSelectedCategories([]);
                  }
                }}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer"
                disabled={optionsLoading}
              >
                <option value="">Select a category...</option>
                {categoryTree.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {'\u00A0\u00A0'.repeat(cat.depth)}{cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Brand */}
          {brands.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  Brand
                </span>
              </label>
              <div className="relative">
                <select
                  value={selectedBrand || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value, 10) : null;
                    setSelectedBrand(value);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer"
                  disabled={optionsLoading}
                >
                  <option value="">Select a brand...</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Short Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Short Description
            </label>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              placeholder="Brief product summary..."
            />
          </div>

          {/* Full Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Product Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              placeholder="Full product details..."
            />
          </div>

          {(productType === 'simple' || productType === 'downloadable') && (
            <>
              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Regular Price (PKR)
                  </label>
                  <input
                    type="number"
                    value={regularPrice}
                    onChange={(e) => setRegularPrice(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Sale Price (PKR)
                  </label>
                  <input
                    type="number"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
            </>
          )}

          {productType === 'simple' && (
            <>
              {/* Stock Management Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted">
                <div>
                  <p className="font-medium text-foreground">Manage Stock</p>
                  <p className="text-sm text-muted-foreground">Track inventory quantity</p>
                </div>
                <button
                  type="button"
                  onClick={() => setManageStock(!manageStock)}
                  className="text-primary"
                >
                  {manageStock ? (
                    <ToggleRight className="w-10 h-10" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* Out of Stock Checkbox */}
              <label className="flex items-center gap-3 p-4 rounded-xl bg-muted cursor-pointer mt-3">
                <div className="relative flex items-center justify-center w-6 h-6 rounded-md border border-border bg-background">
                  <input
                    type="checkbox"
                    className="absolute opacity-0 w-full h-full cursor-pointer"
                    checked={isOutOfStock}
                    onChange={(e) => setIsOutOfStock(e.target.checked)}
                  />
                  {isOutOfStock && <div className="w-4 h-4 bg-primary rounded-sm" />}
                </div>
                <div>
                  <p className="font-medium text-foreground">Out of Stock</p>
                  <p className="text-sm text-muted-foreground">Force product status to out of stock</p>
                </div>
              </label>

              {/* Stock Quantity */}
              {manageStock && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Stock Quantity
                  </label>
                  <input
                    type="number"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="0"
                    min="0"
                  />
                </div>
              )}
            </>
          )}

          {productType === 'external' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Product URL</label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Button Text</label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Buy Product"
                />
              </div>
            </div>
          )}

          {productType === 'downloadable' && (
            <div className="space-y-4 pt-2">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Downloadable File
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">File Name</label>
                <input
                  type="text"
                  value={downloadFileName}
                  onChange={(e) => setDownloadFileName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="e.g. E-book PDF"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">File URL</label>
                <input
                  type="url"
                  value={downloadFileUrl}
                  onChange={(e) => setDownloadFileUrl(e.target.value)}
                  disabled={!!downloadableFile}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                  placeholder="https://..."
                />
              </div>
              
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">OR</span>
                <input
                  type="file"
                  ref={downloadableFileRef}
                  onChange={(e) => setDownloadableFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => downloadableFileRef.current?.click()}
                  className="px-4 py-3 bg-secondary text-secondary-foreground text-sm font-medium rounded-xl flex items-center gap-2 border border-border hover:bg-secondary/80"
                >
                  {downloadableFile ? (
                    <>
                      <Package className="w-4 h-4" />
                      {downloadableFile.name}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload File
                    </>
                  )}
                </button>
                {downloadableFile && (
                  <button
                    type="button"
                    onClick={() => { setDownloadableFile(null); if (downloadableFileRef.current) downloadableFileRef.current.value = ''; }}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {productType === 'variable' && (
            <div className="space-y-4">
              <AttributesUI 
                attributes={attributes} 
                onChange={(newAttrs) => {
                  setAttributes(newAttrs);
                  setAttributesSaved(false);
                }} 
                globalAttributes={globalAttributes} 
              />

              {attributes.length > 0 && !attributesSaved && (
                <button
                  type="button"
                  onClick={() => {
                    setAttributesSaved(true);
                    generateVariations();
                  }}
                  className="w-full py-2 bg-secondary text-secondary-foreground font-medium rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-colors border border-border"
                >
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              )}

              {attributes.length > 0 && attributesSaved && (
                <button
                  type="button"
                  onClick={generateVariations}
                  className="w-full py-2 bg-primary/10 text-primary font-medium rounded-xl text-sm"
                >
                  Generate Variations
                </button>
              )}

              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2 mt-4">
                <Layers className="w-4 h-4" />
                Product Variations
              </h3>
              {isLoadingVariations ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : variations.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 bg-muted rounded-xl text-center">No variations found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {variations.map((variation, index) => (
                    <div key={variation.id} className="p-4 border border-border rounded-xl bg-card">
                      <p className="font-medium text-sm text-foreground mb-3 pb-2 border-b border-border flex justify-between">
                        <span>{variation.attributes?.map(a => a.option).join(' - ') || `Variation #${variation.id}`}</span>
                        {variation.id && variation.id < 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newVars = [...variations];
                              newVars.splice(index, 1);
                              setVariations(newVars);
                            }}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </p>
                      
                      {/* Prices */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Regular Price</label>
                          <input
                            type="number"
                            value={variation.regular_price || ''}
                            onChange={(e) => {
                              const newVars = [...variations];
                              newVars[index].regular_price = e.target.value;
                              setVariations(newVars);
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                            placeholder="0"
                            min="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Sale Price</label>
                          <input
                            type="number"
                            value={variation.sale_price || ''}
                            onChange={(e) => {
                              const newVars = [...variations];
                              newVars[index].sale_price = e.target.value;
                              setVariations(newVars);
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                            placeholder="0"
                            min="0"
                          />
                        </div>
                      </div>
                      
                      {/* Stock */}
                      <div className="flex items-center justify-between mb-2 bg-muted p-2 rounded-lg">
                        <span className="text-xs font-medium text-foreground">Manage Stock</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newVars = [...variations];
                            newVars[index].manage_stock = !newVars[index].manage_stock;
                            setVariations(newVars);
                          }}
                        >
                          {variation.manage_stock ? <ToggleRight className="w-7 h-7 text-primary" /> : <ToggleLeft className="w-7 h-7 text-muted-foreground" />}
                        </button>
                      </div>
                      
                      {variation.manage_stock && (
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Stock Quantity</label>
                          <input
                            type="number"
                            value={variation.stock_quantity ?? ''}
                            onChange={(e) => {
                              const newVars = [...variations];
                              newVars[index].stock_quantity = parseInt(e.target.value, 10) || 0;
                              setVariations(newVars);
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                            placeholder="0"
                            min="0"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {uploadProgress || 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save
                </>
              )}
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
