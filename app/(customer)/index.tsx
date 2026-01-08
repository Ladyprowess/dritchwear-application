import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl, Alert, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { Wallet, Plus, Sparkles, ShoppingBag, Star, ShoppingCart, Copy } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ProductModal from '@/components/ProductModal';
import { formatCurrency, convertFromNGN } from '@/lib/currency';
import EdgeToEdgeWrapper from '@/components/EdgeToEdgeWrapper';
import { useEdgeToEdge } from '@/hooks/useEdgeToEdge';
import ResponsiveGrid from '@/components/ResponsiveGrid';
import * as Clipboard from 'expo-clipboard';


interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category: string;
  sizes: string[];
  colors: string[];
  stock: number;
  total_reviews?: number;
average_rating?: number;

}

interface SpecialOffer {
  id: string;
  title: string;
  subtitle: string;
  discount_text: string;
  promo_code: string;
  is_active: boolean;
}

export default function HomeScreen() {
  const { profile, refreshProfile, user } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [specialOffers, setSpecialOffers] = useState<SpecialOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);

  

const fetchProductsWithReviews = async () => {
  try {
    console.log('Fetching products...');
    
    // First check if we have a session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('No session found, skipping product fetch');
      setLoading(false);
      return;
    }

    // Fetch products
    const { data: productsData, error: productsError } = await supabase
      .from('product_card_data')
      .select('*')
      .eq('is_active', true)
      .limit(6);

    if (productsError) {
      console.error('Error fetching products:', productsError);
      if (!productsError.message.includes('Auth session missing')) {
        Alert.alert('Error', 'Failed to load products');
      }
      return;
    }

    if (!productsData || productsData.length === 0) {
      console.log('No products found');
      setProducts([]);
      return;
    }

    // Fetch review stats for all products
    const productIds = productsData.map(p => p.id);
    const { data: reviewsData, error: reviewsError } = await supabase
      .from('reviews')
      .select('product_id, rating')
      .in('product_id', productIds);

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
      // Continue without reviews
      setProducts(productsData);
      return;
    }

    // Calculate review stats for each product
    const productsWithReviews = productsData.map(product => {
      const productReviews = reviewsData?.filter(r => r.product_id === product.id) || [];
      const totalReviews = productReviews.length;
      
      let averageRating = 0;
      if (totalReviews > 0) {
        const totalRating = productReviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = Math.round((totalRating / totalReviews) * 10) / 10;
      }

      return {
        ...product,
        total_reviews: totalReviews,
        average_rating: averageRating
      };
    });

    console.log('Products with reviews:', productsWithReviews);
    setProducts(productsWithReviews);
    
  } catch (error) {
    console.error('Error in fetchProductsWithReviews:', error);
  }
};


  const fetchSpecialOffers = async () => {
    try {
      console.log('Fetching special offers...');
      
      // First check if we have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session found, skipping special offers fetch');
        return;
      }

      const { data, error } = await supabase
        .from('special_offers')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching special offers:', error);
      } else {
        console.log('Special offers fetched:', data?.length);
        setSpecialOffers(data || []);
      }
    } catch (error) {
      console.error('Error in fetchSpecialOffers:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProductsWithReviews(), fetchSpecialOffers(), refreshProfile()]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (profile) {
      Promise.all([fetchProductsWithReviews(), fetchSpecialOffers()]).finally(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [profile]);

  // Updated formatCurrency function to handle product prices in user's preferred currency
  const formatProductPrice = (priceInNGN: number) => {
    if (!profile?.preferred_currency || profile.preferred_currency === 'NGN') {
      return formatCurrency(priceInNGN, 'NGN');
    }
    
    const convertedPrice = convertFromNGN(priceInNGN, profile.preferred_currency);
    return formatCurrency(convertedPrice, profile.preferred_currency);
  };

  // Get wallet balance in user's preferred currency
  const getWalletBalance = () => {
    if (!profile) return formatCurrency(0, 'NGN');
    
    const currency = profile.preferred_currency || 'NGN';
    const balance = currency === 'NGN' ? 
      profile.wallet_balance : 
      convertFromNGN(profile.wallet_balance, currency);
    
    return formatCurrency(balance, currency);
  };

  const handleFundWallet = () => {
    router.push('/(customer)/fund-wallet');
  };

  const handleCustomOrder = () => {
    router.push('/(customer)/custom-order');
  };

  const handleTrackOrder = () => {
    router.push('/(customer)/orders');
  };

  const handleSeeAllProducts = () => {
    router.push('/(customer)/shop');
  };

  const handleProductPress = (product: Product) => {
    setSelectedProduct(product);
    setShowProductModal(true);
  };

  const handleQuickBuy = (product: Product, event: any) => {
    event.stopPropagation(); // Prevent triggering product modal
    setSelectedProduct(product);
    setShowProductModal(true);
  };

  const handleOrderSuccess = () => {
    fetchProducts(); // Refresh products to update stock
  };

  const currentOffer = specialOffers.length > 0 ? specialOffers[0] : null;

  const handleCopyPromoCode = async (code?: string) => {
    if (!code) return;
  
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied', `Promo code "${code}" copied to clipboard.`);
  };
  

  return (
    <EdgeToEdgeWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
  <View style={styles.userInfo}>
    <Text style={styles.greeting}>Welcome back,</Text>

    <Text
      style={styles.userName}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {profile?.full_name || 'Dritchwear Customer'}
    </Text>
  </View>

  <View style={styles.walletWrapper}>
    <LinearGradient colors={['#7C3AED', '#3B82F6']} style={styles.walletCard}>
      <View style={styles.walletContent}>
        <Wallet size={20} color="#FFFFFF" />
        <Text style={styles.walletBalance}>{getWalletBalance()}</Text>
      </View>
    </LinearGradient>
  </View>
</View>


        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <Pressable style={styles.actionCard} onPress={handleFundWallet}>
              <Plus size={24} color="#7C3AED" />
              <Text style={styles.actionText}>Fund Wallet</Text>
            </Pressable>
            
            <Pressable style={styles.actionCard} onPress={handleCustomOrder}>
  <Image
    source={require('@/assets/images/shop.png')}
    style={styles.customOrderIcon}
  />
  <Text style={styles.actionText}>Custom Order</Text>
</Pressable>

            
            <Pressable style={styles.actionCard} onPress={handleTrackOrder}>
              <ShoppingBag size={24} color="#10B981" />
              <Text style={styles.actionText}>Track Order</Text>
            </Pressable>
          </View>
        </View>

        {/* Featured Products */}
        <View style={styles.productsContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Products</Text>
            <Pressable onPress={handleSeeAllProducts}>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading products...</Text>
            </View>
          ) : products.length > 0 ? (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={{ paddingBottom: 24 }}
              columnWrapperStyle={{
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.productCard}
                  onPress={() => handleProductPress(item)}
                >
                  <Image source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" />
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.productPrice}>{formatProductPrice(item.price)}</Text>
                    <View style={styles.productFooter}>
                    <View style={styles.ratingContainer}>
                    <Star
  size={12}
  color="#E5E7EB"
  fill={
    item.total_reviews && item.total_reviews > 0
      ? '#F59E0B'
      : '#E5E7EB'
  }
/>
<Text style={styles.ratingText}>
  {item.total_reviews && item.total_reviews > 0
    ? `${item.average_rating?.toFixed(1)} (${item.total_reviews})`
    : 'No reviews'}
</Text>

                    </View>
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                    <Pressable
                      style={styles.quickBuyButton}
                      onPress={(event) => handleQuickBuy(item, event)}
                    >
                      <ShoppingCart size={14} color="#FFFFFF" />
                      <Text style={styles.quickBuyText}>Quick Buy</Text>
                    </Pressable>
                  </View>
                </Pressable>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No products available</Text>
            </View>
          )}
        </View>
  
        {/* Special Offer */}
        {currentOffer && (
          <LinearGradient
            colors={['#F59E0B', '#F97316']}
            style={styles.promoBanner}
          >
            <View style={styles.promoContent}>
              <View>
                <Text style={styles.promoTitle}>{currentOffer.title}</Text>
                <Text style={styles.promoSubtitle}>{currentOffer.subtitle}</Text>

<Pressable
  onPress={() => handleCopyPromoCode(currentOffer.promo_code)}
  style={styles.promoCodeCopy}
>
  <Text style={styles.promoCodeText}>
    Use Code: {currentOffer.promo_code}
  </Text>
  <Copy size={14} color="#FFFFFF" />
</Pressable>

              </View>
              <Image
  source={require('@/assets/images/logo.png')}
  style={styles.promoSparkleIcon}
/>

            </View>
          </LinearGradient>
        )}
  
        {/* Modal */}
        <ProductModal
          product={selectedProduct}
          visible={showProductModal}
          onClose={() => {
            setShowProductModal(false);
            setSelectedProduct(null);
          }}
          onOrderSuccess={handleOrderSuccess}
        />
      </ScrollView>
    </EdgeToEdgeWrapper>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  userName: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 2,
  },
  userInfo: {
    flex: 1,
    paddingRight: 12, // space before wallet card
  },
  
  walletCard: {
    borderRadius: 12,
    padding: 1,
    flexShrink: 0, // ✅ wallet never shrinks
  },
  
  walletContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 11,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletBalance: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  quickActionsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginTop: 8,
    textAlign: 'center',
  },
  productsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#7C3AED',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  productCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  productImage: {
    width: '100%',
    height: 120,
  },
  productInfo: {
    padding: 12,
  },
  promoCodeCopy: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  promoCodeText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },

  customOrderIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: '#F59E0B',
  },
  
  
  promoSparkleIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
    tintColor: '#FFFFFF',
  },
  
  
  
  productName: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    lineHeight: 18,
  
    // ✅ reserve space for exactly 2 lines always (18 * 2)
    height: 36,
  
    // keep spacing below name consistent
    marginBottom: 6,
  },
  
  productPrice: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#7C3AED',
    marginBottom: 8,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  categoryText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  quickBuyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 6,
    paddingVertical: 8,
    gap: 4,
  },
  quickBuyText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  promoBanner: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
  },
  promoContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  promoSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 4,
  },
  promoCode: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});