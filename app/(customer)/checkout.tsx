import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useCart, CartItem } from '@/contexts/CartContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, MapPin, CreditCard, Wallet, X, Tag } from 'lucide-react-native';
import { calculateOrderTotal } from '@/lib/fees';
import { formatCurrency, convertFromNGN } from '@/lib/currency';
import PaystackPayment from '@/components/PaystackPayment';


export default function CheckoutScreen() {
  const router = useRouter();
  const { cartData } = useLocalSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const { clearCart } = useCart();
  
  const [items, setItems] = useState<CartItem[]>([]);
  const { appliedPromo } = useCart();
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
const [deliveryCountry, setDeliveryCountry] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPaystack, setShowPaystack] = useState(false);

  const [orderData, setOrderData] = useState<any>(null);
  const [orderNote, setOrderNote] = useState('');
  const defaultAddress = (profile?.location || '').trim(); // or profile?.delivery_address if you have that
const [showAddressPrompt, setShowAddressPrompt] = useState(false);
const [addressPromptHandled, setAddressPromptHandled] = useState(false);


const handleUseDefaultAddress = () => {
  setDeliveryAddress(defaultAddress);

  const parts = defaultAddress.split(',').map(p => p.trim()).filter(Boolean);

  // last two parts become state + country (simple rule)
  const maybeCountry = parts[parts.length - 1] || '';
  const maybeState = parts[parts.length - 2] || '';

  setDeliveryState(maybeState);
  setDeliveryCountry(maybeCountry);

  setShowAddressPrompt(false);
  setAddressPromptHandled(true);
};


const handleChangeAddress = () => {
  setDeliveryAddress('');
  setDeliveryState('');
  setDeliveryCountry('');
  setShowAddressPrompt(false);
  setAddressPromptHandled(true);
};




  useEffect(() => {
    if (cartData) {
      try {
        const parsedItems = JSON.parse(cartData as string);
        setItems(parsedItems);
      } catch (error) {
        console.error('Error parsing cart data:', error);
        Alert.alert('Error', 'Invalid cart data');
        router.back();
      }
    }

    
  }, [cartData]);

  useEffect(() => {
    // Wait until profile loads
    if (!profile) return;
  
    // If prompt already handled, don't show again
    if (addressPromptHandled) return;
  
    // If user has a saved address, ask what to do
    if (defaultAddress.length > 0) {
      setShowAddressPrompt(true);
      return;
    }
  
    // If no saved address, just let them type
    setAddressPromptHandled(true);
  }, [profile, defaultAddress, addressPromptHandled]);
  

  const userCurrency = profile?.preferred_currency || 'NGN';

  const getItemPriceInUserCurrency = (priceInNGN: number) => {
    if (userCurrency === 'NGN') {
      return priceInNGN;
    }
    return convertFromNGN(priceInNGN, userCurrency);
  };

  const getSubtotal = () => {
    return items.reduce((sum, item) => {
      const itemPrice = getItemPriceInUserCurrency(item.price);
      return sum + (itemPrice * item.quantity);
    }, 0);
  };

  const getSubtotalInNGN = () => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateDiscount = () => {
    if (!appliedPromo) return 0;
    return getSubtotal() * appliedPromo.discount;
  };

  const getDiscountedSubtotal = () => {
    return getSubtotal() - calculateDiscount();
  };

  const getTotalItems = () => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Check if delivery address is filled
  const hasDeliveryAddress = () => {
    return (
      deliveryAddress.trim().length > 0 &&
      deliveryState.trim().length > 0 &&
      deliveryCountry.trim().length > 0
    );
  };

  const getFullDeliveryAddress = () => {
    return `${deliveryAddress.trim()}, ${deliveryState.trim()}, ${deliveryCountry.trim()}`;
  };

  

  const handleOrder = async (paymentMethod: 'wallet' | 'card') => {
    if (!deliveryAddress.trim() || !deliveryState.trim() || !deliveryCountry.trim()) {
      Alert.alert(
        'Delivery Address Required',
        'Please enter your delivery address, state, and country.'
      );
      return;
    }
    

    if (!user || !profile) {
      Alert.alert('Authentication Required', 'Please sign in to place an order');
      return;
    }

    setLoading(true);

    try {
      // Calculate totals in NGN (our base currency) with discount applied
      const subtotalNGN = getSubtotalInNGN();
      const discountNGN = appliedPromo ? subtotalNGN * appliedPromo.discount : 0;
      const discountedSubtotalNGN = subtotalNGN - discountNGN;
      const fullDeliveryAddress = getFullDeliveryAddress();


      
      const orderTotals = calculateOrderTotal(discountedSubtotalNGN, fullDeliveryAddress, 'NGN');


      // For wallet payment, check balance
      if (paymentMethod === 'wallet') {
        if (profile.wallet_balance < orderTotals.total) {
          const neededInUserCurrency = convertFromNGN(orderTotals.total, userCurrency);
          const balanceInUserCurrency = convertFromNGN(profile.wallet_balance, userCurrency);
          
          Alert.alert(
            'Insufficient Balance',
            `Your wallet balance is ${formatCurrency(balanceInUserCurrency, userCurrency)}. You need ${formatCurrency(neededInUserCurrency, userCurrency)} to complete this order.`
          );
          setLoading(false);
          return;
        }

        // Process wallet payment immediately
        await processWalletPayment(orderTotals, discountNGN);
      } else {
        // Prepare for online payment
        const paymentCurrency = userCurrency;
        const paymentAmount = userCurrency === 'NGN' ? 
          orderTotals.total : 
          convertFromNGN(orderTotals.total, userCurrency);

        const orderInfo = {
          ...orderTotals,
          items: items.map(item => ({
            product_id: item.productId,
            name: item.productName,
            price: item.price,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
          })),
          delivery_address: fullDeliveryAddress,
          delivery_state: deliveryState.trim(),
delivery_country: deliveryCountry.trim(),

          payment_method: paymentMethod,
          currency: paymentCurrency,
          original_amount: paymentAmount,
          appliedPromo,
          discountAmount: discountNGN,
          notes: orderNote.trim() || null,
description: orderNote.trim() || null,

        };

        setOrderData(orderInfo);

        if (paymentMethod === 'card' && userCurrency === 'NGN') {
          setShowPaystack(true);
        }
      }
    } catch (error) {
      console.error('Error processing order:', error);
      Alert.alert('Error', 'Failed to process order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  

  const processWalletPayment = async (orderTotals: any, discountAmount: number) => {
    try {
      // Prepare order items for database
      const orderItems = items.map(item => ({
        product_id: item.productId,
        name: item.productName,
        price: item.price,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
      }));


      const fullDeliveryAddress = getFullDeliveryAddress();


      // First validate stock availability using the database function
      const { error: stockValidationError } = await supabase.rpc('validate_stock_availability', {
        order_items: orderItems
      });

      if (stockValidationError) {
        throw new Error(`Stock validation failed: ${stockValidationError.message}`);
      }

      // Create order record with payment_status 'paid' to trigger stock reduction
      const { data: orderRecord, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user!.id,
          items: orderItems,
          subtotal: orderTotals.subtotal,
          service_fee: orderTotals.serviceFee,
          delivery_fee: orderTotals.deliveryFee,
          tax: orderTotals.tax,
          total: orderTotals.total,
          payment_method: 'wallet',
          payment_status: 'paid',
          order_status: 'pending',
          delivery_address: fullDeliveryAddress,
          delivery_state: deliveryState.trim(),
delivery_country: deliveryCountry.trim(),

          currency: 'NGN',
          promo_code: appliedPromo?.code || null,
promo_code_id: appliedPromo?.promoId || null,
discount_amount: discountAmount,
notes: orderNote.trim() || null,

        })
        .select()
        .single();

      if (orderError) throw orderError;

      console.log('Order created successfully:', orderRecord.id);
      console.log('Promo used with ID:', appliedPromo?.promoId); // Debug log

      // Deduct from wallet
      const { error: walletError } = await supabase
        .from('profiles')
        .update({
          wallet_balance: profile!.wallet_balance - orderTotals.total
        })
        .eq('id', user!.id);

      if (walletError) throw walletError;

      // Create transaction record
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: user!.id,
          type: 'debit',
          amount: orderTotals.total,
          description: `Order payment - ${getTotalItems()} items${appliedPromo ? ` (${appliedPromo.code} applied)` : ''}`,
          reference: orderRecord.id,
          status: 'completed'
        });

      if (transactionError) throw transactionError;

      await refreshProfile();
      
      // CRITICAL: Clear cart immediately - this removes promo from context
      await clearCart();
      
      // Small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      Alert.alert(
        'Order Placed Successfully',
        'Your order has been confirmed and is now pending processing. You will receive updates as it progresses.',
        [{ text: 'OK', onPress: () => {
          router.replace('/(customer)/orders');
        }}]
      );
    } catch (error) {
      console.error('Error processing wallet payment:', error);
      throw error;
    }
  };

  const handlePaystackSuccess = async (response: any) => {
    setShowPaystack(false);
    await completeOnlinePayment(response.reference, 'paystack');
  };

  const handlePaystackCancel = () => {
    setShowPaystack(false);
    setLoading(false);
    Alert.alert('Payment Cancelled', 'Your payment was cancelled');
  };


  const completeOnlinePayment = async (reference: string, provider: string) => {
    try {
      if (!orderData) throw new Error('Order data not found');

      // First validate stock availability using the database function
      const { error: stockValidationError } = await supabase.rpc('validate_stock_availability', {
        order_items: orderData.items
      });

      if (stockValidationError) {
        throw new Error(`Stock validation failed: ${stockValidationError.message}`);
      }

      // Create order record - stock will be automatically reduced by database trigger
      const { data: orderRecord, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user!.id,
          items: orderData.items,
          subtotal: orderData.subtotal,
          service_fee: orderData.serviceFee,
          delivery_fee: orderData.deliveryFee,
          tax: orderData.tax,
          total: orderData.total,
          payment_method: provider,
          payment_status: 'paid',
          order_status: 'pending',
          delivery_address: orderData.delivery_address,
          delivery_state: orderData.delivery_state,
          delivery_country: orderData.delivery_country,
          currency: orderData.currency,
          original_amount: orderData.original_amount,
          promo_code: orderData.appliedPromo?.code || null,
          promo_code_id: orderData.appliedPromo?.promoId || null,
          discount_amount: orderData.discountAmount || 0,
          notes: orderNote.trim() || null,
        })
        
        .select()
        .single();

      if (orderError) throw orderError;

      console.log('Online payment order created successfully:', orderRecord.id);
      console.log('Promo used with ID:', orderData.appliedPromo?.promoId); // Debug log

      // Create transaction record
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: user!.id,
          type: 'debit',
          amount: orderData.total,
          currency: orderData.currency,
          original_amount: orderData.original_amount,
          description: `Order payment - ${getTotalItems()} items${orderData.appliedPromo ? ` (${orderData.appliedPromo.code} applied)` : ''}`,
          reference: reference,
          status: 'completed',
          payment_provider: provider
        });

      if (transactionError) throw transactionError;

      // CRITICAL: Clear cart immediately - this removes promo from context
      await clearCart();
      
      // Small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100));

      Alert.alert(
        'Order Placed Successfully',
        `Your payment of ${formatCurrency(orderData.original_amount, orderData.currency)} has been processed. Your order is now pending and will be processed soon!`,
        [{ text: 'OK', onPress: () => {
          router.replace('/(customer)/orders');
        }}]
      );
    } catch (error) {
      console.error('Error completing online payment:', error);
      Alert.alert('Error', 'Payment was successful but failed to create order. Please contact support.');
    }
  };

  // Calculate order totals for display with discount
  const subtotalNGN = getSubtotalInNGN();
  const discountNGN = appliedPromo ? subtotalNGN * appliedPromo.discount : 0;
  const discountedSubtotalNGN = subtotalNGN - discountNGN;
  
  // Only calculate delivery fee if address is provided
  const composedAddress = hasDeliveryAddress() ? getFullDeliveryAddress() : '';



const orderTotals = hasDeliveryAddress()
  ? calculateOrderTotal(discountedSubtotalNGN, composedAddress, 'NGN')
  : {
      subtotal: discountedSubtotalNGN,
      serviceFee: discountedSubtotalNGN * 0.02,
      deliveryFee: 0,
      tax: 0,
      discountAmount: discountNGN,
      total: discountedSubtotalNGN + (discountedSubtotalNGN * 0.02) + 0,
      currency: 'NGN',
    };
    
  
  // Convert to user currency for display
  const displayTotals = {
    subtotal: userCurrency === 'NGN' ? subtotalNGN : convertFromNGN(subtotalNGN, userCurrency),
    discount: userCurrency === 'NGN' ? discountNGN : convertFromNGN(discountNGN, userCurrency),
    serviceFee: userCurrency === 'NGN' ? orderTotals.serviceFee : convertFromNGN(orderTotals.serviceFee, userCurrency),
    deliveryFee: userCurrency === 'NGN' ? orderTotals.deliveryFee : convertFromNGN(orderTotals.deliveryFee, userCurrency),
    tax: userCurrency === 'NGN' ? orderTotals.tax : convertFromNGN(orderTotals.tax, userCurrency),
    total: userCurrency === 'NGN' ? orderTotals.total : convertFromNGN(orderTotals.total, userCurrency),
  };
  

  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#1F2937" />
          </Pressable>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Order Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.itemsCount}>
                {getTotalItems()} {getTotalItems() === 1 ? 'Item' : 'Items'}
              </Text>
              
              {items.slice(0, 3).map((item, index) => (
                <View key={index} style={styles.summaryItem}>
                  <Text style={styles.summaryItemName}>
                    {item.productName} ({item.size}, {item.color})
                  </Text>
                  <Text style={styles.summaryItemPrice}>
                    {item.quantity}x {formatCurrency(getItemPriceInUserCurrency(item.price), userCurrency)}
                  </Text>
                </View>
              ))}
              
              {items.length > 3 && (
                <Text style={styles.moreItems}>
                  +{items.length - 3} more items
                </Text>
              )}

              {/* Applied Promo Display */}
              {appliedPromo && (
                <View style={styles.promoDisplay}>
                  <Text style={styles.promoDisplayText}>
                    🎉 {appliedPromo.code} applied: {appliedPromo.description}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Delivery Address */}
          {/* Delivery Address */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Delivery Address</Text>

  {/* Address line */}
  <View style={styles.addressCard}>
    <MapPin size={20} color="#5A2D82" />
    <TextInput
      style={styles.addressInput}
      value={deliveryAddress}
      onChangeText={setDeliveryAddress}
      placeholder="Enter delivery address (street, area, etc.)"
      placeholderTextColor="#9CA3AF"
      multiline
      numberOfLines={3}
    />
  </View>

  {/* State */}
  <View style={[styles.addressCard, { marginTop: 10 }]}>
    <TextInput
      style={[styles.addressInput, { marginLeft: 0, minHeight: 50 }]}
      value={deliveryState}
      onChangeText={setDeliveryState}
      placeholder="State (required)"
      placeholderTextColor="#9CA3AF"
    />
  </View>

  {/* Country */}
  <View style={[styles.addressCard, { marginTop: 10 }]}>
    <TextInput
      style={[styles.addressInput, { marginLeft: 0, minHeight: 50 }]}
      value={deliveryCountry}
      onChangeText={setDeliveryCountry}
      placeholder="Country (required)"
      placeholderTextColor="#9CA3AF"
    />
  </View>
</View>


          {/* Order Totals */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Total</Text>
            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>
                  {formatCurrency(displayTotals.subtotal, userCurrency)}
                </Text>
              </View>

              {appliedPromo && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount ({appliedPromo.code})</Text>
                  <Text style={styles.discountValue}>
                    -{formatCurrency(displayTotals.discount, userCurrency)}
                  </Text>
                </View>
              )}
              
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Service Fee (2%)</Text>
                <Text style={styles.totalValue}>
                  {formatCurrency(displayTotals.serviceFee, userCurrency)}
                </Text>
              </View>
              
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Delivery Fee</Text>
                <Text style={styles.totalValue}>
                  {hasDeliveryAddress() 
                    ? formatCurrency(displayTotals.deliveryFee, userCurrency)
                    : '-'
                  }
                </Text>
              </View>

              <View style={styles.totalRow}>
  <Text style={styles.totalLabel}>VAT (7.5%)</Text>
  <Text style={styles.totalValue}>
    {formatCurrency(displayTotals.tax, userCurrency)}
  </Text>
</View>

              
              <View style={[styles.totalRow, styles.finalTotal]}>
                <Text style={styles.finalTotalLabel}>Total</Text>
                <Text style={styles.finalTotalValue}>
                  {formatCurrency(displayTotals.total, userCurrency)}
                </Text>
              </View>
            </View>
          </View>

          {/* Order Description / Note */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Order Description (Optional)</Text>

  <View style={styles.addressCard}>
    <TextInput
      style={styles.addressInput}
      value={orderNote}
      onChangeText={setOrderNote}
      placeholder="Add a note for your order (e.g. delivery instructions, packaging request, etc.)"
      placeholderTextColor="#9CA3AF"
      multiline
      numberOfLines={3}
    />
  </View>
</View>


          {/* Payment Methods */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            
            {/* Wallet Payment */}
            <Pressable
              style={styles.paymentButton}
              onPress={() => handleOrder('wallet')}
              disabled={loading}
            >
              <Wallet size={20} color="#FFFFFF" />
              <Text style={styles.paymentButtonText}>
                Pay with Wallet ({formatCurrency(convertFromNGN(profile?.wallet_balance || 0, userCurrency), userCurrency)})
              </Text>
            </Pressable>

            {/* ✅ NEW: show message + action for non-NGN users */}
            {userCurrency !== 'NGN' && (
              <View style={styles.ngnOnlyNoteWrap}>
                <Text style={styles.ngnOnlyNoteText}>
                  Card payments are available in Naira (NGN) only. Please fund your wallet in NGN, then pay with wallet.
                </Text>

                <Pressable
                  style={styles.fundWalletLink}
                  onPress={() => router.push('/(customer)/fund-wallet')}
                >
                  <Text style={styles.fundWalletLinkText}>Go to Fund Wallet</Text>
                </Pressable>
              </View>
            )}

            {/* Card Payment (Paystack for NGN) */}
            {userCurrency === 'NGN' && (
              <Pressable
                style={[styles.paymentButton, styles.paystackButton]}
                onPress={() => handleOrder('card')}
                disabled={loading}
              >
                <CreditCard size={20} color="#FFFFFF" />
                <Text style={styles.paymentButtonText}>Pay with Card (Paystack)</Text>
              </Pressable>
            )}

      
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
  visible={showAddressPrompt}
  transparent
  animationType="fade"
  onRequestClose={() => setShowAddressPrompt(false)}
>
  <View style={styles.overlay}>
    <View style={styles.promptCard}>
      <Text style={styles.promptTitle}>Use saved address?</Text>
      <Text style={styles.promptText} numberOfLines={4}>
        {defaultAddress}
      </Text>

      <View style={styles.promptActions}>
        <Pressable style={styles.secondaryBtn} onPress={handleChangeAddress}>
          <Text style={styles.secondaryBtnText}>Change</Text>
        </Pressable>

        <Pressable style={styles.primaryBtn} onPress={handleUseDefaultAddress}>
          <Text style={styles.primaryBtnText}>Use this</Text>
        </Pressable>
      </View>
    </View>
  </View>
</Modal>


      {/* Paystack Payment Modal */}
      <Modal
        visible={showPaystack}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handlePaystackCancel}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Complete Payment</Text>
            <Pressable style={styles.closeButton} onPress={handlePaystackCancel}>
              <X size={24} color="#1F2937" />
            </Pressable>
          </View>
          
          {showPaystack && orderData && user && (
            <PaystackPayment
              email={user.email || ''}
              amount={orderData.total}
              publicKey={process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY || ''}
              customerName={user.user_metadata?.full_name || 'Customer'}
              onSuccess={handlePaystackSuccess}
              onCancel={handlePaystackCancel}
            />
          )}
        </SafeAreaView>
      </Modal>

  
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemsCount: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryItemName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  summaryItemPrice: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  moreItems: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  promoDisplay: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  promoDisplayText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#059669',
    textAlign: 'center',
  },
  addressCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    alignItems: 'flex-start',
  },
  addressInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#1F2937',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  totalsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  promptCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  promptTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#111827',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    marginBottom: 14,
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#5A2D82',
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  
  totalValue: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1F2937',
  },
  discountValue: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#10B981',
  },
  finalTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  finalTotalLabel: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  finalTotalValue: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#5A2D82',
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5A2D82',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 8,
  },
  paystackButton: {
    backgroundColor: '#00C851',
  },
  paymentButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },

  // ✅ NEW styles (only for the NGN-only notice)
  ngnOnlyNoteWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  ngnOnlyNoteText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    marginBottom: 10,
  },
  fundWalletLink: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#5A2D82',
  },
  fundWalletLinkText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
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
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
});