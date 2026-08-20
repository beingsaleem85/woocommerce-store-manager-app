import { useState, FormEvent, useRef, ChangeEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { wpAuthedRequest } from '@/lib/wp-authed-request';
import { uploadToWordPress, uploadMultipleToWordPress } from '@/lib/wp-media-upload';
import { resizeImage, resizeImages, PRODUCT_IMAGE_SIZE } from '@/lib/image-resize';
import { textToHtml } from '@/lib/html-utils';
import { purgeProductCache, purgeCacheAllPlugins } from '@/lib/cache-purge';
import { emitProductUpdate } from '@/lib/product-events';
import { useProductOptions, buildCategoryTree, getCategoryWithParents } from '@/hooks/use-product-options';
import { WCProduct, WCVariation } from '@/types/woocommerce';
import { X, Loader2, Package, Plus, ToggleLeft, ToggleRight, Image, Images, Upload, Trash2, ChevronDown, Tag, FolderTree, Layers, Save, CheckCircle2, ExternalLink } from 'lucide-react';
import { AttributesUI, AttributeData } from './AttributesUI';

interface AddProductModalProps {
  onClose: () => void;
  onSave: (product: WCProduct) => void;
}

interface ImagePreview {
  file: File;
  preview: string;
}

export function AddProductModal({ onClose, onSave }: AddProductModalProps) {
  const { session } = useAuth();
  const { categories, brands, attributes: globalAttributes, isLoading: optionsLoading } = useProductOptions();
  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [regularPrice, setRegularPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [manageStock, setManageStock] = useState(true);
  const [stockQuantity, setStockQuantity] = useState('0');
  const [isOutOfStock, setIsOutOfStock] = useState(false);
  const [sku, setSku] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<number | null>(null);
  const [productImage, setProductImage] = useState<ImagePreview | null>(null);
  const [galleryImages, setGalleryImages] = useState<ImagePreview[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [error, setError] = useState('');

  const [productType, setProductType] = useState<'simple' | 'variable' | 'external' | 'downloadable'>('simple');
  const [externalUrl, setExternalUrl] = useState('');
  const [buttonText, setButtonText] = useState('Buy Product');
  const [downloadFileName, setDownloadFileName] = useState('');
  const [downloadFileUrl, setDownloadFileUrl] = useState('');
  const [downloadableFile, setDownloadableFile] = useState<File | null>(null);
  const downloadableFileRef = useRef<HTMLInputElement>(null);
  const [attributes, setAttributes] = useState<AttributeData[]>([]);
  const [attributesSaved, setAttributesSaved] = useState(false);
  const [variations, setVariations] = useState<Partial<WCVariation>[]>([]);
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

        // Revoke previous preview URL
        if (productImage) {
          URL.revokeObjectURL(productImage.preview);
        }
        setProductImage({
          file: resizedFile,
          preview: URL.createObjectURL(resizedFile)
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

      const newPreviews = resizedFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setGalleryImages((prev) => [...prev, ...newPreviews]);
    } catch (err) {
      setError('Failed to process images');
    } finally {
      setIsResizing(false);
    }
  }

  function removeProductImage() {
    if (productImage) {
      URL.revokeObjectURL(productImage.preview);
      setProductImage(null);
    }
  }

  function removeGalleryImage(index: number) {
    setGalleryImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;

    if (!name.trim()) {
      setError('Product name is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const images: {id: number;}[] = [];

      // Upload product image first
      if (productImage) {
        setUploadProgress('Uploading product image...');
        const uploaded = await uploadToWordPress(productImage.file, session);
        images.push({ id: uploaded.id });
      }

      // Upload gallery images
      if (galleryImages.length > 0) {
        setUploadProgress(`Uploading gallery (0/${galleryImages.length})...`);
        const galleryFiles = galleryImages.map((img) => img.file);
        const uploadedGallery = await uploadMultipleToWordPress(
          galleryFiles,
          session,
          (uploaded, total) => {
            setUploadProgress(`Uploading gallery (${uploaded}/${total})...`);
          }
        );
        uploadedGallery.forEach((media) => {
          images.push({ id: media.id });
        });
      }

      setUploadProgress('Creating product...');

      const body: Record<string, unknown> = {
        name: name.trim(),
        short_description: textToHtml(shortDescription),
        description: textToHtml(description),
        type: productType === 'downloadable' ? 'simple' : productType,
        status: 'publish',
        catalog_visibility: 'visible',
        stock_status: isOutOfStock ? 'outofstock' : 'instock',
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
          }
        } else {
          body.manage_stock = manageStock;
          if (manageStock) {
            body.stock_quantity = parseInt(stockQuantity, 10) || 0;
          }
        }
      } else if (productType === 'external') {
        body.external_url = externalUrl;
        body.button_text = buttonText;
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

      if (images.length > 0) {
        body.images = images;
      }

      if (sku.trim()) {
        body.sku = sku.trim();
      }

      if (selectedCategories.length > 0) {
        body.categories = selectedCategories.map((id) => ({ id }));
      }

      if (selectedBrand) {
        body.brands = [{ id: selectedBrand }];
      }

      const created = await wpAuthedRequest<WCProduct>(
        '/wc/v3/products',
        session,
        {
          method: 'POST',
          body: JSON.stringify(body)
        }
      );

      if (productType === 'variable' && variations.length > 0) {
        setUploadProgress('Creating variations...');
        const createPayload = variations.map(v => ({
          regular_price: v.regular_price || '0',
          sale_price: v.sale_price || '',
          manage_stock: v.manage_stock || false,
          stock_quantity: v.manage_stock ? (v.stock_quantity || 0) : null,
          attributes: v.attributes
        }));
        
        await wpAuthedRequest(`/wc/v3/products/${created.id}/variations/batch`, session, {
          method: 'POST',
          body: JSON.stringify({ create: createPayload })
        });
      }

      // Hack to force LiteSpeed and other caching plugins to purge the shop archive cache
      // Many caching plugins hook into product updates (PUT) but miss product creation (POST) via REST API.
      setUploadProgress('Syncing to frontend...');
      await wpAuthedRequest(
        `/wc/v3/products/${created.id}`,
        session,
        {
          method: 'PUT',
          body: JSON.stringify({ 
            catalog_visibility: 'visible' 
          })
        }
      );

      // Purge cache and notify
      setUploadProgress('Clearing cache...');
      await purgeCacheAllPlugins(session);

      // Notify other components (like Dashboard) that products changed
      emitProductUpdate('add-product');

      console.log('✅ Product created and synced:', created.id, created.name);
      onSave(created);
      setSuccessProduct(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setIsSaving(false);
      setUploadProgress('');
    }
  }

  return (
    <div data-ev-id="ev_12c755867f" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div data-ev-id="ev_dda6753c11"
      className="w-full max-w-lg bg-card rounded-t-3xl p-6 safe-area-bottom animate-slide-up max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}>
        {successProduct ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Product Saved!</h2>
            <p className="text-sm text-muted-foreground mb-8">
              {successProduct.name} has been successfully added to your store.
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
        <div data-ev-id="ev_f8e067e98b" className="flex items-start justify-between mb-6">
          <div data-ev-id="ev_2365f89353" className="flex items-center gap-3">
            <div data-ev-id="ev_ae9d6f6f77" className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div data-ev-id="ev_7b233d1a6f">
              <h2 data-ev-id="ev_c7a5e85ba3" className="font-semibold text-foreground">Add Product</h2>
              <p data-ev-id="ev_152088d819" className="text-sm text-muted-foreground">Create a new product</p>
            </div>
          </div>
          <button data-ev-id="ev_0ea85d1120"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-muted transition-colors -mr-2 -mt-2">

            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form data-ev-id="ev_f20b207d95" onSubmit={handleSubmit} className="space-y-4">
          {error &&
          <div data-ev-id="ev_629a69a715" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
              {error}
            </div>
          }

          {/* Product Image */}
          <div data-ev-id="ev_c75d8662c8">
            <label data-ev-id="ev_8c7dd6483b" className="block text-sm font-medium text-foreground mb-1.5">
              <span data-ev-id="ev_1bf5a07282" className="flex items-center gap-1.5">
                <Image className="w-4 h-4" />
                Product Image
                <span data-ev-id="ev_85d1061bf8" className="text-xs text-muted-foreground font-normal">(auto-resized to 600×600)</span>
                {isResizing && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              </span>
            </label>
            <input data-ev-id="ev_732adc4274"
            ref={productImageRef}
            type="file"
            accept="image/*"
            onChange={handleProductImageSelect}
            className="hidden" />

            {productImage ?
            <div data-ev-id="ev_7f46e5bdd5" className="relative w-32 h-32 rounded-xl overflow-hidden border border-border">
                <img data-ev-id="ev_6e5c28ae24"
              src={productImage.preview}
              alt="Product preview"
              className="w-full h-full object-cover" />

                <button data-ev-id="ev_0ed1fd3a70"
              type="button"
              onClick={removeProductImage}
              className="absolute top-1 right-1 p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">

                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div> :

            <button data-ev-id="ev_7b65bd3be4"
            type="button"
            onClick={() => productImageRef.current?.click()}
            className="w-32 h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground">

                <Upload className="w-6 h-6" />
                <span data-ev-id="ev_4a2a1b49a9" className="text-xs">Upload</span>
              </button>
            }
          </div>

          {/* Gallery Images */}
          <div data-ev-id="ev_521b98f7c1">
            <label data-ev-id="ev_52a5a0b08b" className="block text-sm font-medium text-foreground mb-1.5">
              <span data-ev-id="ev_367b3d6a86" className="flex items-center gap-1.5">
                <Images className="w-4 h-4" />
                Product Gallery
              </span>
            </label>
            <input data-ev-id="ev_30e14db7ae"
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleGallerySelect}
            className="hidden" />

            <div data-ev-id="ev_21b20b21e8" className="flex flex-wrap gap-2">
              {galleryImages.map((img, index) =>
              <div data-ev-id="ev_35c557cc70"
              key={index}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">

                  <img data-ev-id="ev_3cf6f5a88a"
                src={img.preview}
                alt={`Gallery ${index + 1}`}
                className="w-full h-full object-cover" />

                  <button data-ev-id="ev_c3fe9a325a"
                type="button"
                onClick={() => removeGalleryImage(index)}
                className="absolute top-0.5 right-0.5 p-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors">

                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <button data-ev-id="ev_d09a8ed170"
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground">

                <Plus className="w-5 h-5" />
                <span data-ev-id="ev_f95ae218d1" className="text-[10px]">Add</span>
              </button>
            </div>
          </div>

          {/* Product Name */}
          <div data-ev-id="ev_d0c22bd613">
            <label data-ev-id="ev_bfe8206ead" className="block text-sm font-medium text-foreground mb-1.5">
              Product Name <span data-ev-id="ev_6ae934864e" className="text-red-500">*</span>
            </label>
            <input data-ev-id="ev_2739592dc1"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Enter product name" />

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

          {/* SKU */}
          <div data-ev-id="ev_6a8ba7d7e2">
            <label data-ev-id="ev_135fcacfe0" className="block text-sm font-medium text-foreground mb-1.5">
              SKU <span data-ev-id="ev_dcc7c9b7f7" className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input data-ev-id="ev_d721cf2599"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="e.g. WH-1234" />

          </div>

          {/* Category */}
          <div data-ev-id="ev_97cc01bfcf">
            <label data-ev-id="ev_4c13df9a2e" className="block text-sm font-medium text-foreground mb-1.5">
              <span data-ev-id="ev_117e6eb51f" className="flex items-center gap-1.5">
                <FolderTree className="w-4 h-4" />
                Category
              </span>
            </label>
            <div data-ev-id="ev_940a16d29f" className="relative">
              <select data-ev-id="ev_dfc05d9884"
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
              disabled={optionsLoading}>

                <option data-ev-id="ev_8267ee2f8d" value="">Select a category...</option>
                {categoryTree.map((cat) =>
                <option data-ev-id="ev_a13a3fafd2" key={cat.id} value={cat.id}>
                    {'\u00A0\u00A0'.repeat(cat.depth)}{cat.name}
                  </option>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Brand */}
          {brands.length > 0 &&
          <div data-ev-id="ev_ff2c9cb15c">
              <label data-ev-id="ev_d7b98fc0b6" className="block text-sm font-medium text-foreground mb-1.5">
                <span data-ev-id="ev_1f8e24afd1" className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  Brand
                </span>
              </label>
              <div data-ev-id="ev_432f888e2f" className="relative">
                <select data-ev-id="ev_295dfe37a4"
              value={selectedBrand || ''}
              onChange={(e) => {
                const value = e.target.value ? parseInt(e.target.value, 10) : null;
                setSelectedBrand(value);
              }}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer"
              disabled={optionsLoading}>

                  <option data-ev-id="ev_3461aaf0f4" value="">Select a brand...</option>
                  {brands.map((brand) =>
                <option data-ev-id="ev_ba7ca3716a" key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          }

          {/* Short Description */}
          <div data-ev-id="ev_15a7989aa6">
            <label data-ev-id="ev_12789827ed" className="block text-sm font-medium text-foreground mb-1.5">
              Short Description
            </label>
            <textarea data-ev-id="ev_449148be6d"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            placeholder="Brief product summary..." />

          </div>

          {/* Full Description */}
          <div data-ev-id="ev_62c11114ab">
            <label data-ev-id="ev_620ba454fe" className="block text-sm font-medium text-foreground mb-1.5">
              Product Description
            </label>
            <textarea data-ev-id="ev_d1dcd0dcab"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            placeholder="Full product details..." />

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
                  <Save className="w-4 h-4" /> Save Attributes
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

              {variations.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Generated Variations
                  </h3>
                  {variations.map((variation, index) => (
                    <div key={index} className="p-4 border border-border rounded-xl bg-card">
                      <p className="font-medium text-sm text-foreground mb-3 pb-2 border-b border-border flex justify-between">
                        <span>{variation.attributes?.map(a => a.option).join(' - ')}</span>
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
                      </p>
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
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="0"
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
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="0"
                          />
                        </div>
                      </div>
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
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="0"
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
          <div data-ev-id="ev_a5012da091" className="flex gap-3 pt-2">
            <button data-ev-id="ev_aeffe4344f"
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50">

              Cancel
            </button>
            <button data-ev-id="ev_89d2be04c0"
            type="submit"
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">

              {isSaving ?
              <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {uploadProgress || 'Creating...'}
                </> :

              <>
                  <Plus className="w-5 h-5" />
                  Add Product
                </>
              }
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>);

}
