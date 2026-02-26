import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ⚠️ Ensure this points to your Laravel backend IP
const BASE_URL = "http://192.168.1.37:8000/api";

const THEME = {
  bgDark: "#0F172A", // Main background
  cardDark: "#1E293B", // Card background
  primaryBlue: "#0EA5E9", // Accent blue
  textLight: "#F8FAFC", // Main text
  textMuted: "#94A3B8", // Secondary text
  danger: "#EF4444", // Red alerts
  success: "#10B981",
  border: "#334155",
};

export default function WaiterApp() {
  // Auth State
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // App State
  const [activeTab, setActiveTab] = useState<
    "PICKUPS" | "TABLES" | "HISTORY" | "PROFILE"
  >("PICKUPS");
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [servingOrderId, setServingOrderId] = useState<number | null>(null);

  // --- AUTHENTICATION ---
  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    const storedToken = await AsyncStorage.getItem("waiter_token");
    const storedUser = await AsyncStorage.getItem("waiter_user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  };

  const handleLogin = async () => {
    if (!email || !password)
      return Alert.alert("Error", "Please enter credentials");
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${BASE_URL}/waiter/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Login failed");

      await AsyncStorage.setItem("waiter_token", data.token);
      await AsyncStorage.setItem("waiter_user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      Alert.alert("Login Failed", err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem("waiter_token");
    await AsyncStorage.removeItem("waiter_user");
    setToken(null);
    setUser(null);
  };

  // --- DATA FETCHING ---
  const fetchReadyOrders = async () => {
    if (!token) return;
    setLoadingOrders(true);
    try {
      const res = await fetch(`${BASE_URL}/waiter/orders/ready`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (res.ok) setOrders(data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Poll for new ready orders every 10 seconds when on PICKUPS tab
  useEffect(() => {
    if (token && activeTab === "PICKUPS") {
      fetchReadyOrders();
      const interval = setInterval(fetchReadyOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [token, activeTab]);

  // --- ACTIONS ---
  const serveOrder = async (orderId: number) => {
    setServingOrderId(orderId);
    try {
      const res = await fetch(`${BASE_URL}/waiter/orders/${orderId}/serve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to serve order");

      // Remove order from list immediately for fast UI response
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setServingOrderId(null);
    }
  };

  // ================= RENDER LOGIN =================
  if (!token) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: "#F8FAFC", justifyContent: "center" },
        ]}
      >
        <StatusBar style="dark" />
        <View style={styles.loginContainer}>
          <View style={styles.loginLogo}>
            <Ionicons name="restaurant" size={40} color="white" />
          </View>
          <Text style={styles.loginTitle}>Staff Portal</Text>

          <View style={styles.inputWrapper}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={THEME.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email (e.g. waiter1@user.com)"
              placeholderTextColor={THEME.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={THEME.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Password (e.g. 123)"
              placeholderTextColor={THEME.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginBtnText}>LOGIN</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ================= RENDER DASHBOARD =================
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons name="restaurant" size={24} color={THEME.primaryBlue} />
              <Text style={styles.headerTitle}>Ready for Service</Text>
            </View>
            <Text style={styles.headerSubtitle}>
              <View style={styles.greenDot} /> {orders.length} ORDERS WAITING
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
            <TouchableOpacity onPress={fetchReadyOrders} style={styles.iconBtn}>
              <Ionicons name="refresh" size={20} color={THEME.textLight} />
            </TouchableOpacity>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>
            </View>
          </View>
        </View>

        {/* ZONES / FILTERS (Mock) */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterPill, styles.filterPillActive]}
          >
            <Text style={[styles.filterText, styles.filterTextActive]}>
              All Zones
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterPill}>
            <Text style={styles.filterText}>Dining Room</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterPill}>
            <Text style={styles.filterText}>Patio</Text>
          </TouchableOpacity>
        </View>

        {/* CONTENT */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "PICKUPS" && (
            <>
              {loadingOrders && orders.length === 0 ? (
                <ActivityIndicator
                  size="large"
                  color={THEME.primaryBlue}
                  style={{ marginTop: 50 }}
                />
              ) : orders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="checkmark-done-circle-outline"
                    size={60}
                    color={THEME.border}
                  />
                  <Text style={styles.emptyStateText}>
                    All caught up! No orders waiting.
                  </Text>
                </View>
              ) : (
                orders.map((order) => (
                  <View key={order.id} style={styles.orderCard}>
                    {/* Card Header */}
                    <View style={styles.cardHeader}>
                      <View style={styles.tableBadge}>
                        <Text style={styles.tableBadgeText}>
                          T-{order.table_number}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.waitTime}>
                          <Ionicons name="time-outline" size={12} />{" "}
                          {order.wait_time} min
                        </Text>
                        <Text style={styles.waitLabel}>WAIT TIME</Text>
                      </View>
                    </View>

                    {/* Customer Info */}
                    <Text style={styles.customerName}>
                      {order.customer_name}
                    </Text>
                    <View style={styles.orderMetaRow}>
                      <Ionicons
                        name="people-outline"
                        size={14}
                        color={THEME.textMuted}
                      />
                      <Text style={styles.orderMetaText}> Guests</Text>
                      <Text style={styles.dotSeparator}> • </Text>
                      <Ionicons
                        name="restaurant-outline"
                        size={14}
                        color={THEME.textMuted}
                      />
                      <Text style={styles.orderMetaText}>
                        {order.total_items} Items
                      </Text>
                    </View>

                    {/* Kitchen Note (If any) */}
                    {order.notes && (
                      <View style={styles.noteBox}>
                        <Text style={styles.noteLabel}>KITCHEN NOTE</Text>
                        <Text style={styles.noteText}>{order.notes}</Text>
                      </View>
                    )}

                    {/* Serve Button */}
                    <TouchableOpacity
                      style={styles.serveBtn}
                      onPress={() => serveOrder(order.id)}
                      disabled={servingOrderId === order.id}
                    >
                      {servingOrderId === order.id ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <>
                          <Ionicons
                            name="hand-right-outline"
                            size={18}
                            color="white"
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.serveBtnText}>TAP TO SERVE</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === "PROFILE" && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Logged in as {user?.name}
              </Text>
              <TouchableOpacity
                onPress={handleLogout}
                style={[
                  styles.serveBtn,
                  { backgroundColor: THEME.danger, marginTop: 20 },
                ]}
              >
                <Text style={styles.serveBtnText}>LOGOUT</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* BOTTOM NAVIGATION */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            onPress={() => setActiveTab("PICKUPS")}
            style={styles.tab}
          >
            <View>
              <Ionicons
                name="restaurant"
                size={24}
                color={
                  activeTab === "PICKUPS" ? THEME.primaryBlue : THEME.textMuted
                }
              />
              {orders.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{orders.length}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.tabText,
                activeTab === "PICKUPS" && { color: THEME.primaryBlue },
              ]}
            >
              Pickups
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("TABLES")}
            style={styles.tab}
          >
            <Ionicons
              name="grid-outline"
              size={24}
              color={
                activeTab === "TABLES" ? THEME.primaryBlue : THEME.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "TABLES" && { color: THEME.primaryBlue },
              ]}
            >
              Tables
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("HISTORY")}
            style={styles.tab}
          >
            <Ionicons
              name="time-outline"
              size={24}
              color={
                activeTab === "HISTORY" ? THEME.primaryBlue : THEME.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "HISTORY" && { color: THEME.primaryBlue },
              ]}
            >
              History
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("PROFILE")}
            style={styles.tab}
          >
            <Ionicons
              name="person-circle-outline"
              size={24}
              color={
                activeTab === "PROFILE" ? THEME.primaryBlue : THEME.textMuted
              }
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "PROFILE" && { color: THEME.primaryBlue },
              ]}
            >
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.bgDark },
  container: { flex: 1, backgroundColor: THEME.bgDark },

  // Login Styles
  loginContainer: {
    padding: 30,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  loginLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F97316",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  loginTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: THEME.cardDark,
    textAlign: "center",
    marginBottom: 30,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 15, fontSize: 16, color: THEME.cardDark },
  loginBtn: {
    backgroundColor: "#F97316",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  loginBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Dashboard Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: THEME.textLight },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: THEME.textMuted,
    marginTop: 4,
    letterSpacing: 1,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.success,
    marginRight: 5,
    marginTop: 2,
  },
  iconBtn: { padding: 8, backgroundColor: THEME.border, borderRadius: 20 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#475569",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Filters
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: THEME.border,
  },
  filterPillActive: { backgroundColor: THEME.primaryBlue },
  filterText: { color: THEME.textMuted, fontWeight: "600", fontSize: 13 },
  filterTextActive: { color: "white" },

  // Content
  scrollContent: { padding: 20, paddingBottom: 100 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 100,
  },
  emptyStateText: { color: THEME.textMuted, fontSize: 16, marginTop: 15 },

  // Order Card
  orderCard: {
    backgroundColor: THEME.cardDark,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  tableBadge: {
    backgroundColor: THEME.primaryBlue,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  tableBadgeText: { color: "white", fontWeight: "900", fontSize: 20 },
  waitTime: { color: THEME.textLight, fontWeight: "bold", fontSize: 16 },
  waitLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    marginTop: 2,
  },

  customerName: {
    fontSize: 22,
    fontWeight: "700",
    color: THEME.textLight,
    marginBottom: 4,
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  orderMetaText: { color: THEME.textMuted, fontSize: 14, marginLeft: 4 },
  dotSeparator: { color: THEME.border, marginHorizontal: 5 },

  noteBox: {
    backgroundColor: "#0F172A",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 20,
  },
  noteLabel: {
    color: THEME.primaryBlue,
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 4,
  },
  noteText: { color: THEME.textLight, fontStyle: "italic", fontSize: 14 },

  serveBtn: {
    backgroundColor: THEME.primaryBlue,
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  serveBtnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    letterSpacing: 1,
  },

  // Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: THEME.cardDark,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingBottom: 25,
    paddingTop: 10,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabText: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  tabBadge: {
    position: "absolute",
    top: -5,
    right: -10,
    backgroundColor: THEME.danger,
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: THEME.cardDark,
  },
  tabBadgeText: { color: "white", fontSize: 9, fontWeight: "bold" },
});
