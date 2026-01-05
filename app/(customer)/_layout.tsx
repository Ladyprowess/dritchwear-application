import React, { useEffect, useState } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Home, ShoppingBag, User, Bell, Search, ShoppingCart } from 'lucide-react-native';
import { useCart } from '@/contexts/CartContext';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


function CartTabIcon({ size, color }: { size: number; color: string }) {
  const { getTotalItems } = useCart();
  const itemCount = getTotalItems();

  return (
    <View style={styles.cartIconContainer}>
      <ShoppingCart size={size} color={color} />
      {itemCount > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>
            {itemCount > 99 ? '99+' : itemCount.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

function NotificationTabIcon({
  size,
  color,
  unreadCount,
}: {
  size: number;
  color: string;
  unreadCount: number;
}) {
  return (
    <View style={{ position: 'relative' }}>
      <Bell size={size} color={color} />
      {unreadCount > 0 && (
        <View style={styles.notifBadge}>
          <Text style={styles.notifBadgeText}>
            {unreadCount > 99 ? '99+' : unreadCount.toString()}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function CustomerLayout() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  if (loading) return null;

  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (profile?.role === 'admin') return <Redirect href="/(admin)" />;

  useEffect(() => {
    if (!user) return;
  
    const LAST_SEEN_KEY = `last_seen_notification_time_${user.id}`;
  
    const checkNotifications = async () => {
      // ✅ 1) Get unread count (badge)
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq('is_read', false);
  
      setUnreadCount(count || 0);
  
      // ✅ 2) Get the latest notification time
      const { data: latest } = await supabase
        .from('notifications')
        .select('created_at')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(1);
  
      const latestCreatedAt = latest?.[0]?.created_at;
      if (!latestCreatedAt) return;
  
      // ✅ 3) Compare with last stored time
      const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
  
      // First time user runs app: set it, don’t show banner
      if (!lastSeen) {
        await AsyncStorage.setItem(LAST_SEEN_KEY, latestCreatedAt);
        return;
      }
  
      // ✅ Show banner ONLY if there is something newer
      if (new Date(latestCreatedAt) > new Date(lastSeen)) {
        setShowBanner(true);
  
        // After showing once, update last seen so it doesn't show again
        await AsyncStorage.setItem(LAST_SEEN_KEY, latestCreatedAt);
      }
    };
  
    checkNotifications();
  }, [user]);
  

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#7C3AED',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            paddingBottom: 8,
            paddingTop: 8,
            height: 80,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontFamily: 'Inter-Medium',
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="shop"
          options={{
            title: 'Shop',
            tabBarIcon: ({ size, color }) => <Search size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="cart"
          options={{
            title: 'Cart',
            tabBarIcon: ({ size, color }) => <CartTabIcon size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ size, color }) => <ShoppingBag size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Notifications',
            tabBarIcon: ({ size, color }) => (
              <NotificationTabIcon size={size} color={color} unreadCount={unreadCount} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ size, color }) => <User size={size} color={color} />,
          }}
        />

        {/* Hidden screens */}
        <Tabs.Screen name="checkout" options={{ href: null }} />
        <Tabs.Screen name="fund-wallet" options={{ href: null }} />
        <Tabs.Screen name="custom-order" options={{ href: null }} />
        <Tabs.Screen name="wallet-history" options={{ href: null }} />
        <Tabs.Screen name="help-support" options={{ href: null }} />
      </Tabs>

      {/* ✅ Bottom banner overlay (OUTSIDE Tabs) */}
      {showBanner && unreadCount > 0 && (
        <Pressable
          style={styles.bottomBanner}
          onPress={() => {
            setShowBanner(false);
            router.push('/(customer)/notifications');
          }}
        >
          <Text style={styles.bannerText}>
            You have {unreadCount} new notification{unreadCount > 1 ? 's' : ''}
          </Text>
          <Text style={styles.bannerCta}>View</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cartIconContainer: {
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },

  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },

  bottomBanner: {
    position: 'absolute',
    bottom: 90, // above the tab bar
    left: 16,
    right: 16,
    backgroundColor: '#1F2937',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  bannerCta: {
    color: '#A78BFA',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
});
