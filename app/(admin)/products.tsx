// Key changes for dual category support:
// 1. Changed 'category' field to 'categories' array in Product interface
// 2. Updated form to allow selecting 2 categories
// 3. Modified filtering logic to work with category arrays
// 4. Updated database operations to store categories as array

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Package, Plus, Search, Filter, CreditCard as Edit3, Trash2, Save, X, Eye, EyeOff, Image as ImageIcon, Tag, DollarSign, Info } from 'lucide-react-native';
import ProductDetailsModal from '@/components/ProductDetailsModal';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  categories: string[]; // Changed from single category to array
  sizes: string[];
  colors: string[];
  stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  image_url: string;
  categories: string[]; // Changed to array
  sizes: string;
  colors: string;
  stock: string;
  is_active: boolean;
}

const categories = ['T-Shirts', 'Hoodies', 'Polos', 'Joggers', 'Jackets', 'Shorts', 'Trousers', 'Merchandise', 'Accessories']
const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const defaultColors = ['Black', 'White', 'Navy', 'Grey', 'Beige', 'Brown'];

export default function AdminProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    price: '',
    image_url: '',
    categories: [], // Initialize as empty array
    sizes: defaultSizes.join(', '),
    colors: defaultColors.join(', '),
    stock: '0',
    is_active: true,
  });

  const fetchProducts = async () => {
    setLoading(true);
  
    const { data: rawProducts, error: productError } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
  
    if (productError) {
      console.error('Error loading products:', productError.message);
      setLoading(false);
      return;
    }
  
    const { data: images, error: imageError } = await supabase
      .from('product_images')
      .select('product_id, image_url')
      .eq('is_primary', true);
  
    if (imageError) {
      console.error('Error loading images:', imageError.message);
      setLoading(false);
      return;
    }
  
    const productsWithImages = rawProducts.map((product) => {
      const primaryImage = images.find((img) => img.product_id === product.id);
      return {
        ...product,
        image_url: primaryImage?.image_url || product.image_url,
        categories: Array.isArray(product.categories) ? product.categories : 
                    product.category ? [product.category] : [], // Backwards compatibility
      };
    });
  
    setProducts(productsWithImages);
    setFilteredProducts(productsWithImages);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    let filtered = products;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(product => 
        product.categories.includes(selectedCategory)
      );
    }

    if (searchQuery) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.categories.some(cat => cat.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    setFilteredProducts(filtered);
  }, [products, selectedCategory, searchQuery]);

  useEffect(() => {
    const subscription = supabase
      .channel('all-products-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        (payload) => {
          console.log('Product change detected:', payload);
          
          if (payload.eventType === 'UPDATE') {
            setProducts(prevProducts => 
              prevProducts.map(product => 
                product.id === payload.new.id 
                  ? { ...product, ...payload.new }
                  : product
              )
            );
            
            setFilteredProducts(prevFiltered => 
              prevFiltered.map(product => 
                product.id === payload.new.id 
                  ? { ...product, ...payload.new }
                  : product
              )
            );
          } else if (payload.eventType === 'INSERT') {
            fetchProducts();
          } else if (payload.eventType === 'DELETE') {
            setProducts(prev => prev.filter(p => p.id !== payload.old.id));
            setFilteredProducts(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();
  
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      image_url: '',
      categories: [],
      sizes: defaultSizes.join(', '),
      colors: defaultColors.join(', '),
      stock: '0',
      is_active: true,
    });
    setEditingProduct(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      image_url: product.image_url,
      categories: product.categories || [],
      sizes: product.sizes.join(', '),
      colors: product.colors.join(', '),
      stock: product.stock.toString(),
      is_active: product.is_active,
    });
    setShowModal(true);
  };

  const openDetailsModal = (product: Product) => {
    setSelectedProduct(product);
    setShowDetailsModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedProduct(null);
  };

  const toggleCategory = (category: string) => {
    setFormData(prev => {
      const currentCategories = prev.categories;
      
      if (currentCategories.includes(category)) {
        // Remove category
        return {
          ...prev,
          categories: currentCategories.filter(c => c !== category)
        };
      } else {
        // Add category (max 2)
        if (currentCategories.length >= 2) {
          Alert.alert('Limit Reached', 'You can select a maximum of 2 categories');
          return prev;
        }
        return {
          ...prev,
          categories: [...currentCategories, category]
        };
      }
    });
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'Product name is required';
    if (!formData.description.trim()) return 'Description is required';
    if (!formData.price || isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      return 'Valid price is required';
    }
    if (!formData.image_url.trim()) return 'Image URL is required';
    if (formData.categories.length === 0) return 'At least one category is required';
    if (formData.categories.length > 2) return 'Maximum 2 categories allowed';
    if (!formData.stock || isNaN(Number(formData.stock)) || Number(formData.stock) < 0) {
      return 'Valid stock quantity is required';
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }

    const productData = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      price: Number(formData.price),
      image_url: formData.image_url.trim(),
      categories: formData.categories,
      sizes: formData.sizes.split(',').map(s => s.trim()).filter(s => s),
      colors: formData.colors.split(',').map(c => c.trim()).filter(c => c),
      stock: Number(formData.stock),
      is_active: formData.is_active,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        Alert.alert('Success', 'Product updated successfully');
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData);

        if (error) throw error;
        Alert.alert('Success', 'Product added successfully');
      }

      closeModal();
      fetchProducts();
    } catch (error) {
      Alert.alert('Error', 'Failed to save product');
    }
  };

  const handleDelete = (product: Product) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', product.id);

              if (error) throw error;
              Alert.alert('Success', 'Product deleted successfully');
              fetchProducts();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const toggleProductStatus = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      Alert.alert('Error', 'Failed to update product status');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStockColor = (stock: number) => {
    if (stock === 0) return '#EF4444';
    if (stock <= 5) return '#F59E0B';
    if (stock <= 20) return '#3B82F6';
    return '#10B981';
  };

  const renderProduct = (product: Product) => (
    <View key={product.id} style={styles.productCard}>
      <View style={styles.productHeader}>
        <Image
          source={{ uri: product.image_url }}
          style={styles.productImage}
          resizeMode="cover"
        />
        <View style={styles.productInfo}>
          <View style={styles.productTitleRow}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.name}
            </Text>
            <View style={styles.productActions}>
              <Pressable
                style={[styles.actionButton, styles.infoButton]}
                onPress={() => openDetailsModal(product)}
              >
                <Info size={14} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.editButton]}
                onPress={() => openEditModal(product)}
              >
                <Edit3 size={14} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDelete(product)}
              >
                <Trash2 size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          
          <Text style={styles.productDescription} numberOfLines={2}>
            {product.description}
          </Text>
          
          <View style={styles.productMeta}>
            <Text style={styles.productPrice}>
              {formatCurrency(product.price)}
            </Text>
            <View style={styles.categoriesContainer}>
              {product.categories.map((cat, index) => (
                <Text key={index} style={styles.productCategory}>
                  {cat}
                </Text>
              ))}
            </View>
          </View>
          
          <View style={styles.productDetails}>
            <View style={styles.stockContainer}>
              <Text style={[
                styles.productStock,
                { color: getStockColor(product.stock) }
              ]}>
                Stock: {product.stock}
              </Text>
              {product.stock <= 5 && product.stock > 0 && (
                <View style={styles.lowStockBadge}>
                  <Text style={styles.lowStockText}>Low Stock</Text>
                </View>
              )}
              {product.stock === 0 && (
                <View style={styles.outOfStockBadge}>
                  <Text style={styles.outOfStockText}>Out of Stock</Text>
                </View>
              )}
            </View>
            <Pressable
              style={[
                styles.statusButton,
                product.is_active ? styles.activeStatus : styles.inactiveStatus
              ]}
              onPress={() => toggleProductStatus(product)}
            >
              {product.is_active ? (
                <Eye size={12} color="#10B981" />
              ) : (
                <EyeOff size={12} color="#EF4444" />
              )}
              <Text
                style={[
                  styles.statusText,
                  { color: product.is_active ? '#10B981' : '#EF4444' }
                ]}
              >
                {product.is_active ? 'Active' : 'Inactive'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );

  const allCategories = ['All', ...categories];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Products</Text>
        <Pressable style={styles.addButton} onPress={openAddModal}>
          <Plus size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Product</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoriesContent}
          nestedScrollEnabled
        >
          {allCategories.map((category) => (
            <Pressable
              key={category}
              style={[
                styles.categoryChip,
                selectedCategory === category && styles.categoryChipActive
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category && styles.categoryTextActive
                ]}
              >
                {category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading products...</Text>
          </View>
        ) : filteredProducts.length > 0 ? (
          <View style={styles.productsContainer}>
            {filteredProducts.map(renderProduct)}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Package size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Products Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || selectedCategory !== 'All'
                ? 'No products match your search criteria'
                : 'Start by adding your first product'}
            </Text>
          </View>
        )}
      </ScrollView>


      <ProductDetailsModal
        product={selectedProduct}
        visible={showDetailsModal}
        onClose={closeDetailsModal}
      />

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={closeModal}>
                <X size={20} color="#6B7280" />
              </Pressable>
              <Pressable style={styles.saveButton} onPress={handleSave}>
                <Save size={16} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Product Name *</Text>
              <TextInput
                style={styles.formInput}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="Enter product name"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description *</Text>
              <TextInput
                style={[styles.formInput, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Enter product description"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.formLabel}>Price (₦) *</Text>
                <View style={styles.inputWithIcon}>
                  <DollarSign size={16} color="#9CA3AF" />
                  <TextInput
                    style={styles.formInputWithIcon}
                    value={formData.price}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, price: text }))}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              
              <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.formLabel}>Stock *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.stock}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, stock: text }))}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                Categories * (Select up to 2)
              </Text>
              <Text style={styles.formHint}>
                Selected: {formData.categories.length}/2
              </Text>
              <View style={styles.categorySelector}>
                {categories.map((category) => (
                  <Pressable
                    key={category}
                    style={[
                      styles.categoryOption,
                      formData.categories.includes(category) && styles.categoryOptionActive
                    ]}
                    onPress={() => toggleCategory(category)}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        formData.categories.includes(category) && styles.categoryOptionTextActive
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Image URL *</Text>
              <View style={styles.inputWithIcon}>
                <ImageIcon size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.formInputWithIcon}
                  value={formData.image_url}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, image_url: text }))}
                  placeholder="https://images.pexels.com/..."
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
              </View>
              {formData.image_url ? (
                <Image
                  source={{ uri: formData.image_url }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
              ) : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Available Sizes</Text>
              <TextInput
                style={styles.formInput}
                value={formData.sizes}
                onChangeText={(text) => setFormData(prev => ({ ...prev, sizes: text }))}
                placeholder="XS, S, M, L, XL, XXL"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.formHint}>Separate sizes with commas</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Available Colors</Text>
              <TextInput
                style={styles.formInput}
                value={formData.colors}
                onChangeText={(text) => setFormData(prev => ({ ...prev, colors: text }))}
                placeholder="Black, White, Navy, Grey"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.formHint}>Separate colors with commas</Text>
            </View>

            <View style={styles.formGroup}>
              <Pressable
                style={styles.toggleContainer}
                onPress={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
              >
                <View style={styles.toggleInfo}>
                  <Text style={styles.formLabel}>Product Status</Text>
                  <Text style={styles.formHint}>
                    {formData.is_active ? 'Product is visible to customers' : 'Product is hidden from customers'}
                  </Text>
                </View>
                <View style={[styles.toggle, formData.is_active && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, formData.is_active && styles.toggleThumbActive]} />
                </View>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1F2937',
  },
  categoriesContainer: {
    maxHeight: 48,
    marginBottom: 16,
    gap: 4,
  },
  categoriesContent: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  categoryText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  productsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  productHeader: {
    flexDirection: 'row',
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
  },
  productTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  productName: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginRight: 8,
  },
  productActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoButton: {
    backgroundColor: '#6B7280',
  },
  editButton: {
    backgroundColor: '#3B82F6',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
  },
  productDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 18,
  },
  productMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#7C3AED',
  },
  productCategory: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  productDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productStock: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  lowStockBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowStockText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#F59E0B',
  },
  outOfStockBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  outOfStockText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#EF4444',
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  activeStatus: {
    backgroundColor: '#D1FAE5',
  },
  inactiveStatus: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  formLabel: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  formInputWithIcon: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 8,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1F2937',
  },
  formHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    marginTop: 4,
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryOptionActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  categoryOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  categoryOptionTextActive: {
    color: '#FFFFFF',
  },
  
  imagePreview: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginTop: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleInfo: {
    flex: 1,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#7C3AED',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
});