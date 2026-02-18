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
  View,
} from "react-native";

// ⚠️ CHANGE THIS TO YOUR IP
const BASE_URL = "http://192.168.1.32:8000/api";

const THEME = {
  primary: "#FF6B6B",
  secondary: "#2D3436",
  background: "#F8F9FA",
  cardBg: "#FFFFFF",
  textPrimary: "#2D3436",
  textSecondary: "#636E72",
  border: "#EFEFEF",
  success: "#55E6C1",
  danger: "#FF4757",
  warning: "#FFA502",
  overlay: "rgba(0,0,0,0.5)",
};

export default function Menu() {
  const { restaurantId, tableId, qrToken } = useLocalSearchParams();

  // --- STATE ---
  const [customerName, setCustomerName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [joinStatus, setJoinStatus] = useState<
    "active" | "pending" | "approved" | "rejected" | null
  >(null);

  const [menu, setMenu] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orders, setOrders] = useState<any[]>([]);

  const [showTotalBill, setShowTotalBill] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);

  // --- 1. RESET HELPER ---
  // --- 1. RESET HELPER (FIXED) ---
  const clearSession = async () => {
    try {
      // 🔥 STEP 1: Tell Backend to Deactivate Session 🔥
      if (sessionToken) {
        // "Fire and forget" - we don't need to wait for the result
        await fetch(`${BASE_URL}/qr/session/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_token: sessionToken }),
        });
      }
    } catch (e) {
      console.log("Error notifying backend:", e);
    }

    try {
      // STEP 2: Clear Local Data
      const key = `session_${restaurantId}_${tableId}`;
      await AsyncStorage.removeItem(key);

      // STEP 3: Reset State
      setSessionToken(null);
      setCustomerName("");
      setNameSubmitted(false);
      setMenu(null);
      setOrders([]);
      setIsPrimary(false);
      setJoinStatus(null);
      setLoading(false);
    } catch (e) {
      console.error(e);
    }
  };

  // --- 2. INITIAL LOAD ---
  useEffect(() => {
    if (!restaurantId || !tableId) return;

    const loadAndValidateSession = async () => {
      setLoading(true);
      const key = `session_${restaurantId}_${tableId}`;

      try {
        const stored = await AsyncStorage.getItem(key);

        if (!stored) {
          setLoading(false);
          return;
        }

        const parsed = JSON.parse(stored);

        // Validate session with backend
        const res = await fetch(
          `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${parsed.session_token}`,
        );

        // 🛑 STRICT CHECK: If error code, check if rejected
        if (!res.ok) {
          // If it's a 403, it might be pending OR rejected
          if (res.status === 403) {
            try {
              const err = await res.json();
              if (err.join_status === "rejected") {
                // IT IS REJECTED. Set state and STOP loading.
                setJoinStatus("rejected");
                setNameSubmitted(true);
                setLoading(false);
                return;
              }
              // If it is 'pending', we allow it to proceed to the "Waiting" screen
            } catch (e) {
              await clearSession();
              return;
            }
          } else {
            // 401 or 404 means dead session -> Clear it
            await clearSession();
            return;
          }
        }

        const data = await res.json();

        // Restore State
        setSessionToken(parsed.session_token);
        setCustomerName(parsed.customer_name);

        if (data.session) {
          setIsPrimary(data.session.is_primary);
          setJoinStatus(data.session.join_status);
        } else {
          setIsPrimary(parsed.is_primary || false);
          setJoinStatus(parsed.join_status);
        }

        setNameSubmitted(true);

        if (
          res.ok &&
          (data.session?.join_status === "approved" || data.session?.is_primary)
        ) {
          setMenu(data);
          fetchOrders(parsed.session_token);
        }
      } catch (e) {
        await clearSession();
      } finally {
        setLoading(false);
      }
    };

    loadAndValidateSession();
  }, []);

  // --- 3. POLLING ---
  useEffect(() => {
    if (!sessionToken) return;

    let interval: NodeJS.Timeout;

    if (isPrimary) {
      interval = setInterval(fetchPendingJoinRequests, 5000);
    } else if (joinStatus === "pending") {
      interval = setInterval(checkMySessionStatus, 3000);
    }

    return () => clearInterval(interval);
  }, [sessionToken, isPrimary, joinStatus]);

  // --- 4. API ACTIONS ---

  const checkMySessionStatus = async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${sessionToken}`,
      );

      if (res.ok) {
        // APPROVED
        const data = await res.json();
        setMenu(data);
        setJoinStatus("approved");

        // Update Local Storage
        const key = `session_${restaurantId}_${tableId}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.join_status = "approved";
          parsed.is_primary = data.session.is_primary;
          await AsyncStorage.setItem(key, JSON.stringify(parsed));
        }

        Alert.alert("Approved", "You can now order!");
      } else {
        // 🔴 REJECTION LOGIC
        // If we get an error, we assume rejected UNLESS the backend explicitly says "pending"
        let isStillPending = false;

        if (res.status === 403) {
          try {
            const data = await res.json();
            if (data.join_status === "pending") {
              isStillPending = true; // Still waiting
            }
          } catch (e) {}
        }

        // If it is NOT pending, it implies REJECTION.
        if (!isStillPending) {
          setJoinStatus("rejected");
        }
      }
    } catch (e) {}
  };

  const startSession = async () => {
    if (!customerName.trim()) return Alert.alert("Required", "Enter name");
    setLoading(true);

    try {
      const key = `session_${restaurantId}_${tableId}`;
      await AsyncStorage.removeItem(key);

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

      setSessionToken(data.session_token);
      setCustomerName(data.customer_name || customerName);
      setIsPrimary(data.is_primary);
      setJoinStatus(data.join_status);
      setNameSubmitted(true);

      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          session_token: data.session_token,
          customer_name: data.customer_name || customerName,
          is_primary: data.is_primary,
          join_status: data.join_status,
        }),
      );

      if (
        data.is_primary ||
        data.join_status === "approved" ||
        data.join_status === "active"
      ) {
        await fetchMenu(data.session_token);
        fetchOrders(data.session_token);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenu = async (token: string) => {
    try {
      const res = await fetch(
        `${BASE_URL}/menu/${restaurantId}/${tableId}/${qrToken}?session_token=${token}`,
      );
      if (!res.ok) throw new Error("Menu Load Failed");
      const data = await res.json();
      setMenu(data);
    } catch (err) {
      console.log(err);
    }
  };

  const fetchOrders = async (token: string) => {
    try {
      const res = await fetch(`${BASE_URL}/orders/session/${token}`);
      if (res.ok) setOrders(await res.json());
    } catch (err) {}
  };

  const fetchPendingJoinRequests = async () => {
    try {
      const res = await fetch(`${BASE_URL}/table/${tableId}/pending-requests`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data);
        if (data.length > 0 && !showRequestsModal) setShowRequestsModal(true);
      }
    } catch (e) {}
  };

  const respondToRequest = async (id: number, action: "approve" | "reject") => {
    try {
      await fetch(`${BASE_URL}/session/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setPendingRequests((prev) => prev.filter((p) => p.id !== id));
      if (pendingRequests.length <= 1) setShowRequestsModal(false);
    } catch (e) {
      Alert.alert("Error", "Network Error");
    }
  };

  const placeOrder = async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch(`${BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_id: tableId,
          session_token: sessionToken,
          items: orderData.items.map((i) => ({
            menu_item_id: i.id,
            quantity: i.qty,
          })),
        }),
      });
      const data = await res.json();
      if (res.status === 403) return Alert.alert("Wait", data.message);
      if (!res.ok) throw new Error(data.message);

      setCart({});
      fetchOrders(sessionToken);
      Alert.alert("Success", "Order Placed");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const updateCart = (id: number, delta: number) => {
    setCart((prev) => {
      const n = (prev[id] || 0) + delta;
      if (n <= 0) {
        const { [id]: _, ...r } = prev;
        return r;
      }
      return { ...prev, [id]: n };
    });
  };

  const orderData = useMemo(() => {
    if (!menu) return { items: [], totalQty: 0, totalPrice: 0 };
    let q = 0,
      p = 0,
      items: any[] = [];
    menu.categories.forEach((c: any) =>
      c.items.forEach((i: any) => {
        if (cart[i.id]) {
          q += cart[i.id];
          p += cart[i.id] * parseFloat(i.price);
          items.push({ ...i, qty: cart[i.id] });
        }
      }),
    );
    return { items, totalQty: q, totalPrice: p };
  }, [cart, menu]);

  const grandTotal = useMemo(
    () => orders.reduce((s, o) => s + parseFloat(o.total_amount), 0),
    [orders],
  );

  // ==================== VIEW RENDER LOGIC ====================

  // 1. GLOBAL LOADING (Initial check)
  if (loading)
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={{ marginTop: 15, color: THEME.textSecondary }}>
          Connecting...
        </Text>
      </View>
    );

  // 2. LOGIN SCREEN (No user name)
  if (!nameSubmitted)
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.authContainer}>
          <Text style={styles.authEmoji}>🍽️</Text>
          <Text style={styles.authTitle}>Join Table</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter your name"
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={startSession}>
            <Text style={styles.primaryBtnText}>Join</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

  // 3. REJECTED SCREEN (🔥 PRIORITY OVER MENU 🔥)
  // This must be checked BEFORE the menu check to avoid showing the loading spinner.
  if (joinStatus === "rejected")
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="close-circle" size={80} color={THEME.danger} />
        <Text style={[styles.authTitle, { marginTop: 20 }]}>
          Request Rejected
        </Text>
        <Text
          style={{
            color: THEME.textSecondary,
            textAlign: "center",
            paddingHorizontal: 30,
            marginBottom: 30,
          }}
        >
          The Host has declined your request to join this table.
        </Text>
        <TouchableOpacity onPress={clearSession} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );

  // 4. PENDING (WAITING ROOM)
  if (joinStatus === "pending")
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.warning} />
        <Text style={[styles.authTitle, { marginTop: 20 }]}>Waiting...</Text>
        <Text
          style={{
            color: THEME.textSecondary,
            textAlign: "center",
            paddingHorizontal: 30,
          }}
        >
          Waiting for host to approve{" "}
          <Text style={{ fontWeight: "bold" }}>{customerName}</Text>
        </Text>
        <TouchableOpacity onPress={clearSession} style={{ marginTop: 30 }}>
          <Text
            style={{
              color: THEME.textSecondary,
              textDecorationLine: "underline",
            }}
          >
            Cancel Request
          </Text>
        </TouchableOpacity>
      </View>
    );

  // 5. LOADING MENU (Fallback)
  // Only show this if we are NOT rejected, NOT pending, but menu is still null
  if (!menu)
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={THEME.primary} />
        <Text style={{ marginTop: 10, color: "gray" }}>Loading Menu...</Text>
        <TouchableOpacity
          onPress={() => fetchMenu(sessionToken!)}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: THEME.primary }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={clearSession}
          style={{
            marginTop: 40,
            backgroundColor: "#f0f0f0",
            padding: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "black" }}>Reset</Text>
        </TouchableOpacity>
      </View>
    );

  // 6. MAIN APP RENDER
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerGreeting}>
              {customerName} {isPrimary && "(Host)"}
            </Text>
            <Text style={styles.headerSubtitle}>Table {tableId}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {isPrimary && pendingRequests.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.billBtnHeader,
                  { backgroundColor: THEME.warning },
                ]}
                onPress={() => setShowRequestsModal(true)}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  {pendingRequests.length} Req
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.billBtnHeader, { backgroundColor: "#636E72" }]}
              onPress={clearSession}
            >
              <Ionicons name="log-out-outline" size={18} color="white" />
            </TouchableOpacity>
            {orders.length > 0 && (
              <TouchableOpacity
                style={styles.billBtnHeader}
                onPress={() => setShowTotalBill(true)}
              >
                <Text style={{ color: "white" }}>₹{grandTotal.toFixed(0)}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* MENU LIST */}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {menu.categories.map((cat: any) => (
            <View key={cat.id} style={styles.section}>
              <Text style={styles.categoryTitle}>{cat.name}</Text>
              {cat.items.map((item: any) => (
                <View key={item.id} style={styles.menuItemCard}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDescription}>
                      {item.description}
                    </Text>
                    <Text style={styles.itemPrice}>₹{item.price}</Text>
                  </View>
                  <View style={styles.qtyContainer}>
                    {cart[item.id] ? (
                      <View style={styles.qtySelector}>
                        <TouchableOpacity
                          onPress={() => updateCart(item.id, -1)}
                          style={styles.qtyBtn}
                        >
                          <Ionicons name="remove" size={16} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{cart[item.id]}</Text>
                        <TouchableOpacity
                          onPress={() => updateCart(item.id, 1)}
                          style={styles.qtyBtn}
                        >
                          <Ionicons name="add" size={16} />
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
              ))}
            </View>
          ))}
        </ScrollView>

        {/* CHECKOUT */}
        {orderData.totalQty > 0 && (
          <View style={styles.footerContainer}>
            <TouchableOpacity style={styles.checkoutBtn} onPress={placeOrder}>
              <Text style={styles.checkoutText}>
                {orderData.totalQty} Items | ₹{orderData.totalPrice}
              </Text>
              <Text style={styles.checkoutText}>Place Order</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* MODALS */}
        <Modal visible={showRequestsModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Requests</Text>
                <TouchableOpacity onPress={() => setShowRequestsModal(false)}>
                  <Ionicons name="close" size={24} />
                </TouchableOpacity>
              </View>
              {pendingRequests.map((r) => (
                <View key={r.id} style={styles.requestRow}>
                  <Text style={styles.requestName}>{r.customer_name}</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => respondToRequest(r.id, "reject")}
                      style={[styles.actionBtn, { backgroundColor: "#ffe5e5" }]}
                    >
                      <Ionicons name="close" color="red" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => respondToRequest(r.id, "approve")}
                      style={[styles.actionBtn, { backgroundColor: "#e5fff5" }]}
                    >
                      <Ionicons name="checkmark" color="green" size={20} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </Modal>

        <Modal visible={showTotalBill} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Bill</Text>
                <TouchableOpacity onPress={() => setShowTotalBill(false)}>
                  <Ionicons name="close" size={24} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {orders.map((o) => (
                  <View
                    key={o.id}
                    style={{
                      marginBottom: 10,
                      paddingBottom: 10,
                      borderBottomWidth: 1,
                      borderColor: "#eee",
                    }}
                  >
                    <Text style={{ fontWeight: "bold" }}>Order #{o.id}</Text>
                    {o.items.map((i: any, idx: number) => (
                      <Text key={idx}>
                        {i.quantity} x {i.item_name} - ₹
                        {i.quantity * i.unit_price}
                      </Text>
                    ))}
                  </View>
                ))}
                <Text
                  style={{ fontSize: 20, fontWeight: "bold", marginTop: 10 }}
                >
                  Total: ₹{grandTotal}
                </Text>
              </ScrollView>
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  headerGreeting: { fontSize: 18, fontWeight: "bold" },
  headerSubtitle: { color: "gray" },
  billBtnHeader: {
    padding: 8,
    borderRadius: 8,
    marginLeft: 5,
    backgroundColor: THEME.primary,
  },
  scrollContent: { padding: 15, paddingBottom: 100 },
  section: { marginBottom: 20 },
  categoryTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  menuItemCard: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: "bold" },
  itemDescription: { color: "gray", fontSize: 12 },
  itemPrice: { fontWeight: "bold", marginTop: 5 },
  qtyContainer: { justifyContent: "center", marginLeft: 10 },
  qtySelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
  },
  qtyBtn: { padding: 5 },
  qtyText: { marginHorizontal: 10, fontWeight: "bold" },
  addBtn: { backgroundColor: "#fff0f0", padding: 8, borderRadius: 5 },
  addBtnText: { color: THEME.primary, fontWeight: "bold" },
  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: "#eee",
  },
  checkoutBtn: {
    backgroundColor: THEME.primary,
    padding: 15,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  checkoutText: { color: "white", fontWeight: "bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  requestName: { fontSize: 16, fontWeight: "bold" },
  actionBtn: { padding: 8, borderRadius: 5 },
  authContainer: { flex: 1, justifyContent: "center", padding: 20 },
  authEmoji: { fontSize: 50, textAlign: "center", marginBottom: 20 },
  authTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  inputGroup: { marginBottom: 20 },
  label: { fontWeight: "bold", marginBottom: 5 },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 10,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },
});
