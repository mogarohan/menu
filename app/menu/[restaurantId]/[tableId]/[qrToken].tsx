import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

// --- CONFIGURATION ---
const BASE_URL = "http://127.0.0.1:8000/api";
const THEME = {
  primary: "#FF6B6B",
  secondary: "#2D3436",
  background: "#F8F9FA",
  cardBg: "#FFFFFF",
  textPrimary: "#2D3436",
  textSecondary: "#636E72",
  border: "#EFEFEF",
  success: "#55E6C1",
  overlay: "rgba(0,0,0,0.5)",
};

export default function Menu() {
  const { restaurantId, tableId, qrToken } = useLocalSearchParams();

  const [customerName, setCustomerName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [menu, setMenu] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orders, setOrders] = useState<any[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showTotalBill, setShowTotalBill] = useState(false);

  // --- UPDATED HELPER FOR PRICES ---
  // Now checks for 'price' OR 'unit_price' to handle both Menu and Order objects
  const formatPrice = (value: any) => {
    const num = parseFloat(value);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  // Safe calculation that looks for the correct property
  const calculateItemTotal = (item: any) => {
    // Database items use 'unit_price', Menu items use 'price'
    const price = item.unit_price || item.price || 0;
    const qty = item.quantity || item.qty || 0;
    const num = parseFloat(price);
    return isNaN(num) ? "0.00" : (num * qty).toFixed(2);
  };

  // --- EFFECTS & LOGIC ---
  useEffect(() => {
    if (!restaurantId || !tableId) return;
    const loadSession = async () => {
      try {
        const key = `session_${restaurantId}_${tableId}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSessionToken(parsed.session_token);
          setCustomerName(parsed.customer_name);
          setNameSubmitted(true);
          fetchMenu(parsed.session_token);
          fetchOrders(parsed.session_token);
        }
      } catch (e) {
        console.error("Session load error", e);
      }
    };
    loadSession();
  }, []);

  const fetchMenu = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${token}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to load menu");
      setMenu(data);
    } catch (err: any) {
      Alert.alert("Menu Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async (token: string) => {
    try {
      const res = await fetch(`${BASE_URL}/orders/session/${token}`);
      const data = await res.json();
      if (res.ok) setOrders(data);
    } catch (err) {
      console.log("Order fetch error", err);
    }
  };

  const startSession = async () => {
    if (!customerName.trim())
      return Alert.alert("Required", "Please enter your name.");

    setLoading(true);
    try {
      const response = await fetch(
        `${BASE_URL}/qr/session/start/${restaurantId}/${tableId}/${qrToken}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ customer_name: customerName }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      await AsyncStorage.setItem(
        `session_${restaurantId}_${tableId}`,
        JSON.stringify({
          session_token: data.session_token,
          customer_name: customerName,
        }),
      );

      setSessionToken(data.session_token);
      setNameSubmitted(true);
      fetchMenu(data.session_token);
      fetchOrders(data.session_token);
    } catch (error: any) {
      Alert.alert("Connection Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const placeOrder = async () => {
    if (!sessionToken)
      return Alert.alert("Session Expired", "Please scan QR again.");
    if (orderData.totalQty === 0) return;

    try {
      const response = await fetch(`${BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_id: tableId,
          session_token: sessionToken,
          items: orderData.items.map((item) => ({
            menu_item_id: item.id,
            quantity: item.qty,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      setCart({});
      fetchOrders(sessionToken);
      Alert.alert("Success", "Your order has been sent to the kitchen!");
    } catch (err: any) {
      Alert.alert("Order Failed", err.message);
    }
  };

  const updateCart = (id: number, delta: number) => {
    setCart((prev) => {
      const newQty = (prev[id] || 0) + delta;
      if (newQty <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: newQty };
    });
  };

  const orderData = useMemo(() => {
    if (!menu) return { items: [], totalQty: 0, totalPrice: 0 };
    let totalQty = 0;
    let totalPrice = 0;
    const items: any[] = [];

    menu.categories.forEach((cat: any) => {
      cat.items.forEach((item: any) => {
        const qty = cart[item.id];
        if (qty > 0) {
          totalQty += qty;
          totalPrice += qty * parseFloat(item.price);
          items.push({ ...item, qty });
        }
      });
    });
    return { items, totalQty, totalPrice };
  }, [cart, menu]);

  const grandTotal = useMemo(() => {
    return orders.reduce(
      (sum, order) => sum + parseFloat(order.total_amount),
      0,
    );
  }, [orders]);

  if (loading && !menu && nameSubmitted) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  if (!nameSubmitted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.authContainer}>
          <Text style={styles.authEmoji}>🍽️</Text>
          <Text style={styles.authTitle}>Let's get started</Text>
          <Text style={styles.authSubtitle}>
            Enter your name to start ordering.
          </Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              placeholder="e.g. John Doe"
              value={customerName}
              onChangeText={setCustomerName}
              style={styles.textInput}
            />
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={startSession}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryBtnText}>View Menu</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerGreeting}>Hi, {customerName}</Text>
            <Text style={styles.headerSubtitle}>Table #{tableId}</Text>
          </View>
          {orders.length > 0 && (
            <TouchableOpacity
              style={styles.billBtnHeader}
              onPress={() => setShowTotalBill(true)}
            >
              <Ionicons name="receipt-outline" size={16} color="white" />
              <Text style={styles.billBtnText}>
                Bill: ₹{grandTotal.toFixed(0)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Order History Section */}
          {orders.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Orders</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
              >
                {orders.map((order) => (
                  <TouchableOpacity
                    key={order.id}
                    style={styles.orderCard}
                    onPress={() => setSelectedOrder(order)}
                  >
                    <View style={styles.orderHeader}>
                      <Text style={styles.orderId}>#{order.id}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              order.status === "completed"
                                ? "#E3FCEF"
                                : "#FFF4E5",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color:
                                order.status === "completed"
                                  ? "#006644"
                                  : "#B95000",
                            },
                          ]}
                        >
                          {order.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.orderTotal}>
                      ₹{formatPrice(order.total_amount)}
                    </Text>
                    <Text style={styles.orderItems}>
                      {order.items.length} items • Tap for details
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Menu Categories */}
          {!menu ? (
            <Text style={styles.errorText}>Menu unavailable</Text>
          ) : (
            menu.categories.map((category: any) => (
              <View key={category.id} style={styles.section}>
                <Text style={styles.categoryTitle}>{category.name}</Text>
                {category.items.map((item: any) => {
                  const quantity = cart[item.id] || 0;
                  return (
                    <View key={item.id} style={styles.menuItemCard}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                        <Text style={styles.itemPrice}>
                          ₹{formatPrice(item.price)}
                        </Text>
                      </View>
                      <View style={styles.qtyContainer}>
                        {quantity > 0 ? (
                          <View style={styles.qtySelector}>
                            <TouchableOpacity
                              onPress={() => updateCart(item.id, -1)}
                              style={styles.qtyBtn}
                            >
                              <Ionicons
                                name="remove"
                                size={18}
                                color={THEME.primary}
                              />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{quantity}</Text>
                            <TouchableOpacity
                              onPress={() => updateCart(item.id, 1)}
                              style={styles.qtyBtn}
                            >
                              <Ionicons
                                name="add"
                                size={18}
                                color={THEME.primary}
                              />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => updateCart(item.id, 1)}
                            style={styles.addBtn}
                          >
                            <Text style={styles.addBtnText}>ADD</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* Floating Cart Button */}
        {orderData.totalQty > 0 && (
          <View style={styles.footerContainer}>
            <TouchableOpacity style={styles.checkoutBtn} onPress={placeOrder}>
              <View style={styles.checkoutInfo}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{orderData.totalQty}</Text>
                </View>
                <Text style={styles.checkoutText}>Place Order</Text>
              </View>
              <Text style={styles.checkoutPrice}>
                ₹{orderData.totalPrice.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* --- MODAL 1: SINGLE ORDER DETAILS --- */}
        <Modal visible={!!selectedOrder} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Order Details #{selectedOrder?.id}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedOrder(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={THEME.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedOrder?.items.map((item: any, index: number) => (
                  <View key={index} style={styles.receiptRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.receiptItemName}>
                        {item.item_name || "Item"}
                      </Text>
                      <Text style={styles.receiptItemQty}>
                        Qty: {item.quantity}
                      </Text>
                    </View>
                    {/* UPDATED: Pass the whole item object */}
                    <Text style={styles.receiptItemPrice}>
                      ₹{calculateItemTotal(item)}
                    </Text>
                  </View>
                ))}
                <View style={styles.divider} />
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptTotalLabel}>Total</Text>
                  <Text style={styles.receiptTotalValue}>
                    ₹{formatPrice(selectedOrder?.total_amount)}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptStatusLabel}>Status</Text>
                  <Text style={styles.receiptStatusValue}>
                    {selectedOrder?.status.toUpperCase()}
                  </Text>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* --- MODAL 2: TOTAL BILL --- */}
        <Modal visible={showTotalBill} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Total Bill</Text>
                <TouchableOpacity
                  onPress={() => setShowTotalBill(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={THEME.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.billSectionTitle}>Order Summary</Text>
                {orders.map((order, idx) => (
                  <View key={order.id} style={{ marginBottom: 15 }}>
                    <Text style={styles.billOrderHeader}>
                      Order #{order.id} (
                      {new Date(order.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      )
                    </Text>
                    {order.items.map((item: any, i: number) => (
                      <View key={i} style={styles.billRow}>
                        <Text style={styles.billItemText}>
                          {item.quantity} x {item.item_name}
                        </Text>
                        {/* UPDATED: Pass the whole item object */}
                        <Text style={styles.billItemPrice}>
                          ₹{calculateItemTotal(item)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}

                <View style={styles.divider} />

                <View style={styles.billRow}>
                  <Text style={styles.billTotalLabel}>Grand Total</Text>
                  <Text style={styles.billTotalValue}>
                    ₹{grandTotal.toFixed(2)}
                  </Text>
                </View>

                <Text style={styles.billNote}>
                  Please proceed to the counter to pay or ask your waiter.
                </Text>

                <View style={{ height: 20 }} />
              </ScrollView>

              <TouchableOpacity
                style={styles.requestBillBtn}
                onPress={() => setShowTotalBill(false)}
              >
                <Text style={styles.requestBillText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  safeArea: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerGreeting: { fontSize: 20, fontWeight: "700", color: THEME.textPrimary },
  headerSubtitle: { fontSize: 14, color: THEME.textSecondary },
  billBtnHeader: {
    backgroundColor: THEME.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 5,
  },
  billBtnText: { color: "white", fontWeight: "bold", fontSize: 14 },

  // Sections
  scrollContent: { paddingBottom: 100 },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: THEME.textPrimary },
  categoryTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginBottom: 16,
  },

  // Order Card
  orderCard: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    width: 170,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  orderId: { fontWeight: "700", color: THEME.textPrimary },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },
  orderTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: THEME.textPrimary,
    marginBottom: 4,
  },
  orderItems: { fontSize: 12, color: THEME.textSecondary },

  // Menu Item
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemInfo: { flex: 1, paddingRight: 16 },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.textPrimary,
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginBottom: 8,
  },
  itemPrice: { fontSize: 15, fontWeight: "700", color: THEME.textPrimary },
  qtyContainer: { justifyContent: "center", alignItems: "center" },
  addBtn: {
    backgroundColor: "#FFF0F0",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFDCDC",
  },
  addBtnText: { color: THEME.primary, fontWeight: "700", fontSize: 12 },
  qtySelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    padding: 4,
  },
  qtyBtn: { padding: 6 },
  qtyText: { marginHorizontal: 8, fontWeight: "600", fontSize: 14 },

  // Footer / Cart
  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 10,
  },
  checkoutBtn: {
    backgroundColor: THEME.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
  },
  checkoutInfo: { flexDirection: "row", alignItems: "center" },
  badge: {
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 12,
  },
  badgeText: { color: "white", fontWeight: "bold" },
  checkoutText: { color: "white", fontSize: 16, fontWeight: "700" },
  checkoutPrice: { color: "white", fontSize: 18, fontWeight: "800" },

  // Modals (Receipts) - FIXED
  modalOverlay: {
    flex: 1,
    backgroundColor: THEME.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    width: "100%",
    maxHeight: "85%", // Fix for screen overflow
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 15,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  receiptItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  receiptItemQty: { fontSize: 14, color: THEME.textSecondary, marginTop: 2 },
  receiptItemPrice: { fontSize: 16, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 15 },
  receiptTotalLabel: { fontSize: 18, fontWeight: "bold" },
  receiptTotalValue: { fontSize: 18, fontWeight: "bold", color: THEME.primary },
  receiptStatusLabel: { fontSize: 14, color: THEME.textSecondary },
  receiptStatusValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: THEME.textPrimary,
  },

  // Bill Modal Specific
  billSectionTitle: {
    fontSize: 14,
    color: THEME.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  billOrderHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#888",
    marginBottom: 5,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  billItemText: { fontSize: 15, color: THEME.textPrimary },
  billItemPrice: { fontSize: 15, fontWeight: "500" },
  billTotalLabel: { fontSize: 22, fontWeight: "800" },
  billTotalValue: { fontSize: 22, fontWeight: "800", color: THEME.textPrimary },
  billNote: {
    textAlign: "center",
    color: "#999",
    fontSize: 12,
    marginTop: 20,
    fontStyle: "italic",
  },
  requestBillBtn: {
    backgroundColor: "black",
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },
  requestBillText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Auth
  authContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "white",
  },
  authEmoji: { fontSize: 48, marginBottom: 16 },
  authTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginBottom: 8,
  },
  authSubtitle: { fontSize: 16, color: THEME.textSecondary, marginBottom: 30 },
  inputGroup: { marginBottom: 30 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    backgroundColor: "#FAFAFA",
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontSize: 18, fontWeight: "700" },
  errorText: { textAlign: "center", marginTop: 50, color: "red" },
});
