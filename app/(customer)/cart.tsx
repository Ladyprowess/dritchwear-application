import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { ShoppingCart, Plus, Minus, Trash2, ArrowRight, Tag } from 'lucide-react-native';
import { formatCurrency, convertFromNGN } from '@/lib/currency';
import { supabase } from '@/lib/supabase';

export default function CartScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { items, updateQuantity, removeItem, clearCart, getTotalItems, getSubtotal, appliedPromo, setAppliedPromo } = useCart();
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [availablePromos, setAvailablePromos] = useState<any[]>([]);
  const [loadingPromo, setLoadingPromo] = useState(false);
  const [validatingPromo, setValidatingPromo] = useState(false);

  const userCurrency = profile?.preferred_currency || 'NGN';

  useEffect(() => {
    const fetchPromos = async () => {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('is_active', true);

      if (!error) setAvailablePromos(data || []);
    };

    fetchPromos();
  }, []);

  // Re-validate applied promo when cart screen loads or user changes
  useEffect(() => {
    if (appliedPromo && profile?.id) {
      validateExistingPromo();
    }
  }, [appliedPromo?.promoId, profile?.id]);

  // In cart.tsx, replace the validateExistingPromo function:

const validateExistingPromo = async () => {
  if (!appliedPromo || !profile?.id) return;

  setValidatingPromo(true);
  try {
    // Check if user has used this promo in any completed order
    const hasUsed = await checkPromoUsage(appliedPromo.promoId, profile.id);
    
    if (hasUsed) {
      // CRITICAL: Remove the promo immediately from context
      await setAppliedPromo(null);
      
      // Show error message
      setPromoError('This promo code has already been used and cannot be applied again');
      
      // Clear error after 5 seconds
      setTimeout(() => setPromoError(''), 5000);
    }
  } catch (error) {
    console.error('Error validating existing promo:', error);
    // On error, also clear the promo to be safe
    await setAppliedPromo(null);
  } finally {
    setValidatingPromo(false);
  }
};

  // Check if user has already used this promo code in any completed order
  const checkPromoUsage = async (promoId: string, userId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .eq('promo_code_id', promoId)
      .limit(1);

    if (error) {
      console.error('Error checking promo usage:', error);
      return false;
    }

    return data && data.length > 0;
  };

  const handleUpdateQuantity = async (index: number, change: number) => {
    const newQuantity = items[index].quantity + change;
    await updateQuantity(index, newQuantity);
  };

  const handleRemoveItem = async (index: number) => {
    Alert.alert(
      'Remove Item',
      'Are you sure you want to remove this item from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeItem(index) }
      ]
    );
  };

  const handleClearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            await clearCart(); // This now clears both cart and promo
            setPromoCode('');
            setPromoError('');
          }
        }
      ]
    );
  };

  const getItemPriceInUserCurrency = (priceInNGN: number) => {
    if (userCurrency === 'NGN') {
      return priceInNGN;
    }
    return convertFromNGN(priceInNGN, userCurrency);
  };

  const getSubtotalInUserCurrency = () => {
    return items.reduce((sum, item) => {
      const itemPrice = getItemPriceInUserCurrency(item.price);
      return sum + (itemPrice * item.quantity);
    }, 0);
  };

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
  
    if (!code) {
      setPromoError('Please enter a promo code');
      return;
    }

    if (!profile?.id) {
      setPromoError('Please sign in to use promo codes');
      return;
    }
  
    setLoadingPromo(true);
    setPromoError('');
  
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .single();
  
      if (error || !data) {
        setPromoError('Invalid or expired promo code');
        return;
      }

      // Check if user has already used this specific promo code
      const hasUsedPromo = await checkPromoUsage(data.id, profile.id);
      if (hasUsedPromo) {
        setPromoError('You have already used this promo code');
        return;
      }
  
      // Usage limits
      if (data.max_usage !== null && data.used_count >= data.max_usage) {
        setPromoError('This promo code has reached its usage limit');
        return;
      }
  
      // Expiry check
      const now = new Date();
      if (data.expires_at && new Date(data.expires_at) < now) {
        setPromoError('This promo code has expired');
        return;
      }
  
      // Minimum order amount
      if (
        data.min_order_amount &&
        getSubtotalInUserCurrency() < convertFromNGN(data.min_order_amount, userCurrency)
      ) {
        setPromoError(
          `Minimum order of ${formatCurrency(convertFromNGN(data.min_order_amount, userCurrency), userCurrency)} required`
        );
        return;
      }
  
      // First-time-only check (for users who have never placed any order)
      if (data.first_time_only) {
        const { count, error: countError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id);
  
        if (countError) {
          setPromoError('Could not validate eligibility. Please try again.');
          return;
        }
  
        if ((count || 0) > 0) {
          setPromoError('This promo code is only for first-time users');
          return;
        }
      }
  
      // Apply promo to context
      await setAppliedPromo({
        code: data.code,
        discount: data.discount_percentage / 100,
        description: data.description || `${data.discount_percentage}% off`,
        promoId: data.id,
      });
  
      setPromoCode('');
      Alert.alert('Promo Applied!', `${data.code} has been applied to your order.`);
    } catch (e) {
      console.error('Error applying promo code:', e);
      setPromoError('Error applying promo code. Please try again.');
    } finally {
      setLoadingPromo(false);
    }
  };

  const handleRemovePromo = async () => {
    await setAppliedPromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const calculateDiscount = () => {
    if (!appliedPromo) return 0;
    return getSubtotalInUserCurrency() * appliedPromo.discount;
  };

  const getFinalTotal = () => {
    return getSubtotalInUserCurrency() - calculateDiscount();
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty. Add some items before checkout.');
      return;
    }
  
    // Re-validate promo before checkout
    if (appliedPromo && profile?.id) {
      const hasUsed = await checkPromoUsage(appliedPromo.promoId, profile.id);
      if (hasUsed) {
        // Clear invalid promo
        await setAppliedPromo(null);
        Alert.alert(
          'Promo Code Invalid', 
          'The promo code has already been used and has been removed from your cart.'
        );
        return;
      }
    }
    
    // Navigate to checkout with cart data and promo info (only if promo is valid)
    router.push({
      pathname: '/(customer)/checkout',
      params: { 
        cartData: JSON.stringify(items)
      }
    });
    
  };
  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Shopping Cart</Text>
        </View>
        
        <View style={styles.emptyContainer}>
          <ShoppingCart size={80} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>
            Add some items to your cart to get started
          </Text>
          <Pressable 
            style={styles.shopButton}
            onPress={() => router.push('/(customer)/shop')}
          >
            <Text style={styles.shopButtonText}>Start Shopping</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shopping Cart</Text>
        <Pressable onPress={handleClearCart}>
          <Text style={styles.clearText}>Clear All</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Cart Items */}
        <View style={styles.itemsContainer}>
          <Text style={styles.itemsTitle}>
            {getTotalItems()} {getTotalItems() === 1 ? 'Item' : 'Items'}
          </Text>
          
          {items.map((item, index) => (
            <View key={`${item.productId}-${item.size}-${item.color}`} style={styles.cartItem}>
              <Image
                source={{ uri: item.productImage }}
                style={styles.itemImage}
                resizeMode="cover"
              />
              
              <View style={styles.itemDetails}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.itemVariant}>
                  Size: {item.size} • Color: {item.color}
                </Text>
                <Text style={styles.itemPrice}>
                  {formatCurrency(getItemPriceInUserCurrency(item.price), userCurrency)}
                </Text>
              </View>
              
              <View style={styles.itemActions}>
                <View style={styles.quantityControls}>
                  <Pressable
                    style={styles.quantityButton}
                    onPress={() => handleUpdateQuantity(index, -1)}
                  >
                    <Minus size={16} color="#7C3AED" />
                  </Pressable>
                  <Text style={styles.quantityText}>{item.quantity}</Text>
                  <Pressable
                    style={styles.quantityButton}
                    onPress={() => handleUpdateQuantity(index, 1)}
                  >
                    <Plus size={16} color="#7C3AED" />
                  </Pressable>
                </View>
                
                <Pressable
                  style={styles.removeButton}
                  onPress={() => handleRemoveItem(index)}
                >
                  <Trash2 size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {/* Promo Code Section */}
        <View style={styles.promoSection}>
          <Text style={styles.promoTitle}>Promo Code</Text>
          
          {validatingPromo && (
            <Text style={styles.validatingText}>Validating promo code...</Text>
          )}
          
          {appliedPromo ? (
            <View style={styles.appliedPromoCard}>
              <View style={styles.appliedPromoInfo}>
                <Tag size={16} color="#10B981" />
                <View style={styles.appliedPromoText}>
                  <Text style={styles.appliedPromoCode}>{appliedPromo.code}</Text>
                  <Text style={styles.appliedPromoDescription}>{appliedPromo.description}</Text>
                </View>
              </View>
              <Pressable style={styles.removePromoButton} onPress={handleRemovePromo}>
                <Text style={styles.removePromoText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.promoContainer}>
              <TextInput
                style={[styles.promoInput, promoError && styles.promoInputError]}
                value={promoCode}
                onChangeText={(text) => {
                  setPromoCode(text);
                  if (promoError) setPromoError('');
                }}
                placeholder="Enter promo code"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
              />
              <Pressable 
                style={[styles.promoButton, loadingPromo && styles.promoButtonDisabled]} 
                onPress={handleApplyPromo}
                disabled={loadingPromo}
              >
                <Text style={styles.promoButtonText}>
                  {loadingPromo ? 'Applying...' : 'Apply'}
                </Text>
              </Pressable>
            </View>
          )}
          
          {promoError ? (
            <Text style={styles.promoError}>{promoError}</Text>
          ) : null}
        </View>

        {/* Order Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(getSubtotalInUserCurrency(), userCurrency)}
            </Text>
          </View>
          
          {appliedPromo && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount ({appliedPromo.code})</Text>
              <Text style={styles.discountValue}>
                -{formatCurrency(calculateDiscount(), userCurrency)}
              </Text>
            </View>
          )}
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={styles.summaryNote}>Calculated at checkout</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service Fee</Text>
            <Text style={styles.summaryNote}>Calculated at checkout</Text>
          </View>
          
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(getFinalTotal(), userCurrency)}+
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.checkoutSection}>
        <Pressable style={styles.checkoutButton} onPress={handleCheckout}>
          <Text style={styles.checkoutButtonText}>
            Proceed to Checkout
          </Text>
          <ArrowRight size={20} color="#FFFFFF" />
        </Pressable>
      </View>
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
  clearText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#EF4444',
  },
  scrollView: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  shopButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  shopButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  itemsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  itemsTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 4,
  },
  itemVariant: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#7C3AED',
  },
  itemActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    minWidth: 24,
    textAlign: 'center',
  },
  removeButton: {
    padding: 8,
  },
  promoSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  promoTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 12,
  },
  validatingText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  promoContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  promoInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1F2937',
  },
  promoInputError: {
    borderColor: '#EF4444',
  },
  promoButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  promoButtonDisabled: {
    opacity: 0.6,
  },
  promoButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  promoError: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#EF4444',
    marginTop: 6,
  },
  appliedPromoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  appliedPromoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appliedPromoText: {
    marginLeft: 8,
    flex: 1,
  },
  appliedPromoCode: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#10B981',
  },
  appliedPromoDescription: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#059669',
  },
  removePromoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
  },
  removePromoText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#EF4444',
  },
  summarySection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  discountValue: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#10B981',
  },
  summaryNote: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  totalValue: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#7C3AED',
  },
  checkoutSection: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  checkoutButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});