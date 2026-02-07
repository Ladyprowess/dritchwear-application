import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Home, ShoppingBag, User, Bell, Search, ShoppingCart } from 'lucide-react-native';
import { useCart } from '@/contexts/CartContext';
import { View, Text, StyleSheet, Pressable, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = {
  purple: '#5A2D82', // Dritchwear purple
  gold: '#FDB813',   // Dritchwear gold
};

function CartTabIcon({ size, color }: { size: number; color: string }) {
  const { getTotalItems } = useCart();
  const itemCount = getTotalItems();

  return (
    <View style={styles.cartIconContainer}>
      <ShoppingCart size={size} color={color} />
      {itemCount > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount.toString()}</Text>
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
  // ✅ FIXED: Call ALL hooks first, before any conditional returns
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const bannerTimerRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  // ✅ All hook-based calculations must happen here
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : insets.bottom;
  const TAB_BAR_BASE_HEIGHT = 90;

  // ✅ All useCallback and useMemo hooks
  const refreshUnreadCount = useCallback(async () => {
    if (!user?.id) return;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .eq('is_read', false);

    if (error) {
      console.log('❌ refreshUnreadCount error:', error);
      return;
    }

    setUnreadCount(count || 0);
  }, [user?.id]);

  // ✅ All useEffect hooks must be called unconditionally
  useEffect(() => {
    if (!user?.id) return;

    const LAST_SEEN_KEY = `last_seen_notification_time_${user.id}`;
    let cancelled = false;

    const checkNotifications = async () => {
      await refreshUnreadCount();

      const { data: latest, error: latestErr } = await supabase
        .from('notifications')
        .select('created_at')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestErr) {
        console.log('❌ latest notification fetch error:', latestErr);
        return;
      }

      const latestCreatedAt = latest?.[0]?.created_at;
      if (!latestCreatedAt) return;

      const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);

      if (!lastSeen) {
        await AsyncStorage.setItem(LAST_SEEN_KEY, latestCreatedAt);
        return;
      }

      if (new Date(latestCreatedAt) > new Date(lastSeen)) {
        if (!cancelled) setShowBanner(true);
        await AsyncStorage.setItem(LAST_SEEN_KEY, latestCreatedAt);

        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => {
          if (!cancelled) setShowBanner(false);
        }, 6000);
      }
    };

    checkNotifications();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshUnreadCount();
      }
    });

    const realtimeChannel = supabase
      .channel(`notifications-all-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          // ✅ no filter here
        },
        async (payload) => {
          const n = payload.new as any;

          // ✅ only react to:
          // - notifications for this user
          // - broadcast notifications (user_id null)
          if (n.user_id && n.user_id !== user.id) return;

          console.log('🔔 REALTIME NOTIF:', n);

          if (!cancelled) setShowBanner(true);

          // ✅ if you treat null as unread, count it too
          const isUnread = n.is_read === false || n.is_read == null;
          if (!cancelled && isUnread) setUnreadCount((prev) => prev + 1);

          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => {
            if (!cancelled) setShowBanner(false);
          }, 6000);

          await AsyncStorage.setItem(LAST_SEEN_KEY, n.created_at);
        }
      )
      .subscribe((status) => {
        console.log('✅ realtime status:', status);
      });

    return () => {
      cancelled = true;
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);

      sub.remove();
      supabase.removeChannel(realtimeChannel);
    };
  }, [user?.id, refreshUnreadCount]);

  // ✅ NOW it's safe to do conditional returns (after ALL hooks are called)
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (profile?.role === 'admin') return <Redirect href="/(admin)" />;

  // ✅ Regular component render
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BRAND.purple,
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
            paddingTop: 8,
            paddingBottom: 8 + bottomInset,
            height: TAB_BAR_BASE_HEIGHT + bottomInset,
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
          listeners={{
            tabPress: async () => {
              await refreshUnreadCount();
            },
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ size, color }) => <User size={size} color={color} />,
          }}
        />

        <Tabs.Screen name="checkout" options={{ href: null }} />
        <Tabs.Screen name="fund-wallet" options={{ href: null }} />
        <Tabs.Screen name="custom-order" options={{ href: null }} />
        <Tabs.Screen name="wallet-history" options={{ href: null }} />
        <Tabs.Screen name="help-support" options={{ href: null }} />
      </Tabs>

      {showBanner && (
        <Pressable
          style={[styles.bottomBanner, { bottom: TAB_BAR_BASE_HEIGHT + bottomInset + 10 }]}
          onPress={async () => {
            setShowBanner(false);
            await refreshUnreadCount();
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
    left: 16,
    right: 16,
    backgroundColor: '#1F2937',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 50,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  bannerCta: {
    color: BRAND.gold,
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
});