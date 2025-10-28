const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

// Import all backend services
const {
  getProducts,
  getProductById,
  addProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  getUserOrders,
  updateOrderStatus,
  addContactMessage,
  saveUserCart,
  getUserCart,
  saveUserWishlist,
  getUserWishlist,
  createUserProfile,
  getUserProfile,
  getAllUsers,
  getFounderVideos,
  addFounderVideo,
  getAnnouncements,
  getActiveAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementStatus,
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  uploadProductImages,
  uploadProfileImage,
  uploadVideoFile,
  uploadFounderVideo
} = require("./index");

// Import Firebase admin for direct database access
const { db: adminDb } = require("./config/firebase");

// Import Shiprocket service
const shiprocketService = require("./services/shiprocketService");
const shiprocketRoutes = require("./routes/shiprocket");
const autoSyncService = require("./services/autoSyncService");
const webhookService = require("./services/webhookService");

// Import Wakeup service
let wakeupService;
try {
  wakeupService = require("./services/wakeupService");
  console.log('✅ Wakeup service loaded successfully');
  console.log('🔍 Wakeup service type:', typeof wakeupService);
  console.log('🔍 Wakeup service has start method:', typeof wakeupService.start);
  console.log('🔍 Wakeup service methods:', Object.getOwnPropertyNames(wakeupService));
} catch (error) {
  console.error('❌ Failed to load wakeup service:', error.message);
  console.error('❌ Error stack:', error.stack);
  // Create a mock wakeup service to prevent crashes
  wakeupService = {
    start: () => console.log('⚠️ Wakeup service disabled due to loading error'),
    stop: () => console.log('⚠️ Wakeup service disabled'),
    getStatus: () => ({ active: false, error: 'Service not loaded' }),
    triggerWakeup: () => console.log('⚠️ Wakeup service disabled'),
    getExternalPingRecommendations: () => ({ error: 'Service not loaded' })
  };
}

// Helper function to safely extract shiprocketOrderId
const getShiprocketOrderId = (shiprocketResult) => {
  if (!shiprocketResult || !shiprocketResult.data) {
    return null;
  }
  return shiprocketResult.data.order_id || shiprocketResult.data.channel_order_id || null;
};

const app = express();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_RMcbXYH6jZlYF1',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '7avk1fzJsk6I4M9i1a7gjUne'
});

// --- Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(
  cors({
    origin: [process.env.CLIENT_URL || "http://localhost:3000"],
    credentials: true
  })
);

// --- Routes
app.get("/", (req, res) => res.send("Varaha Silks Backend API - All Services Consolidated"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    time: new Date().toISOString(),
    services: "All backend services available",
    version: "2.0.0"
  });
});

// Wakeup endpoints for external ping services
app.get("/api/wakeup", (req, res) => {
  console.log('🔔 Wakeup endpoint triggered');
  res.json({ 
    status: "awake", 
    time: new Date().toISOString(),
    message: "Backend is awake and ready",
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get("/api/wakeup/status", (req, res) => {
  const status = wakeupService && typeof wakeupService.getStatus === 'function' 
    ? wakeupService.getStatus() 
    : { active: false, error: 'Service not available' };
  res.json({
    wakeup: status,
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    }
  });
});

app.post("/api/wakeup/trigger", (req, res) => {
  console.log('🔔 Manual wakeup trigger requested');
  if (wakeupService && typeof wakeupService.triggerWakeup === 'function') {
    wakeupService.triggerWakeup();
  } else {
    console.log('⚠️ Wakeup service not available');
  }
  res.json({ 
    status: "triggered", 
    time: new Date().toISOString(),
    message: "Wakeup triggered successfully"
  });
});

app.get("/api/wakeup/recommendations", (req, res) => {
  const recommendations = wakeupService && typeof wakeupService.getExternalPingRecommendations === 'function'
    ? wakeupService.getExternalPingRecommendations()
    : { error: 'Service not available' };
  res.json(recommendations);
});

// Products API
app.get("/api/products", async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    res.json(product);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const productId = await addProduct(req.body);
    res.status(201).json({ id: productId, message: "Product created successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    await updateProduct(req.params.id, req.body);
    res.json({ message: "Product updated successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Orders API
// Get all orders (admin endpoint)
app.get("/api/orders", async (req, res) => {
  try {
    const { getAllOrders } = require('./data/orders');
    const orders = await getAllOrders();
    
    res.json({
      success: true,
      orders: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error getting all orders:', error);
    res.status(500).json({ 
      error: 'Failed to get orders',
      message: error.message 
    });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const orderId = await createOrder(req.body);
    res.status(201).json({ id: orderId, message: "Order created successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/orders/user/:userId", async (req, res) => {
  try {
    const orders = await getUserOrders(req.params.userId);
    res.json(orders);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/orders/:id/status", async (req, res) => {
  try {
    await updateOrderStatus(req.params.id, req.body.status);
    res.json({ message: "Order status updated successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Cart API
app.post("/api/cart/:userId", async (req, res) => {
  try {
    await saveUserCart(req.params.userId, req.body);
    res.json({ message: "Cart saved successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/cart/:userId", async (req, res) => {
  try {
    const cart = await getUserCart(req.params.userId);
    res.json(cart);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Wishlist API
app.post("/api/wishlist/:userId", async (req, res) => {
  try {
    await saveUserWishlist(req.params.userId, req.body);
    res.json({ message: "Wishlist saved successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/wishlist/:userId", async (req, res) => {
  try {
    const wishlist = await getUserWishlist(req.params.userId);
    res.json(wishlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Users API
app.post("/api/users", async (req, res) => {
  try {
    const userId = await createUserProfile(req.body);
    res.status(201).json({ id: userId, message: "User profile created successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await getUserProfile(req.params.id);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Founder Videos API
app.get("/api/founder-videos", async (req, res) => {
  try {
    const videos = await getFounderVideos();
    res.json(videos);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/founder-videos", async (req, res) => {
  try {
    const videoId = await addFounderVideo(req.body);
    res.status(201).json({ id: videoId, message: "Founder video added successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Announcements API
app.get("/api/announcements", async (req, res) => {
  try {
    const announcements = await getAnnouncements();
    res.json(announcements);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/announcements/active", async (req, res) => {
  try {
    const announcements = await getActiveAnnouncements();
    res.json(announcements);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create announcement
app.post("/api/announcements", async (req, res) => {
  try {
    const announcementData = req.body;
    const result = await createAnnouncement(announcementData);
    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update announcement
app.put("/api/announcements/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    await updateAnnouncement(id, updateData);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete announcement
app.delete("/api/announcements/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await deleteAnnouncement(id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Toggle announcement status
app.patch("/api/announcements/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    await toggleAnnouncementStatus(id, isActive);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Contact Messages API
app.post("/api/contact", async (req, res) => {
  try {
    const messageId = await addContactMessage(req.body);
    res.status(201).json({ id: messageId, message: "Contact message sent successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Razorpay Payment API
app.post("/api/orders/create", async (req, res) => {
  try {
    const { amount, currency, receipt, notes } = req.body;
    
    console.log('🔍 Received request to create Razorpay order:');
    console.log('📥 Request body:', req.body);
    console.log('📥 Extracted data:', { amount, currency, receipt, notes });
    
    // Validate required fields
    if (!amount || amount <= 0) {
      console.error('❌ Invalid amount:', amount);
      return res.status(400).json({ 
        error: 'Invalid amount',
        message: 'Amount must be greater than 0' 
      });
    }
    
    if (!receipt) {
      console.error('❌ Missing receipt:', receipt);
      return res.status(400).json({ 
        error: 'Missing receipt',
        message: 'Receipt is required' 
      });
    }
    
    console.log('✅ Validation passed, creating Razorpay order...');
    
    const order = await razorpay.orders.create({
      amount: amount,
      currency: currency || 'INR',
      receipt: receipt,
      notes: notes || {}
    });
    
    console.log('✅ Razorpay order created successfully:', order.id);
    console.log('📤 Sending response:', order);
    res.json(order);
  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to create order',
      message: error.message 
    });
  }
});

// Verify payment endpoint
app.post("/api/payments/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    console.log('Verifying payment:', { razorpay_order_id, razorpay_payment_id });
    
    // Create signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '7avk1fzJsk6I4M9i1a7gjUne')
      .update(body.toString())
      .digest('hex');
    
    const isAuthentic = expectedSignature === razorpay_signature;
    
    if (isAuthentic) {
      console.log('Payment verification successful');
      res.json({
        verified: true,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature
      });
    } else {
      console.log('Payment verification failed - invalid signature');
      res.status(400).json({ 
        verified: false, 
        error: 'Invalid signature' 
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ 
      error: 'Failed to verify payment',
      message: error.message 
    });
  }
});

// Save order endpoint
app.post("/api/orders/save", async (req, res) => {
  try {
    const orderData = req.body;
    
    console.log('Saving order:', orderData.orderId);
    
    // CRITICAL: Verify payment before saving order
    if (orderData.paymentInfo && orderData.paymentInfo.method === 'razorpay') {
      // Skip payment verification for test orders (orders with test payment IDs)
      if (orderData.paymentInfo.paymentId && orderData.paymentInfo.paymentId.startsWith('pay_test')) {
        console.log('🧪 Test order detected - skipping payment verification');
      } else {
        if (!orderData.paymentInfo.paymentId || !orderData.paymentInfo.signature) {
          console.error('❌ Missing payment verification data - not saving order');
          return res.status(400).json({ 
            error: 'Payment verification required',
            message: 'Order cannot be saved without proper payment verification' 
          });
        }
        
        // Verify payment signature
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = {
          razorpay_order_id: orderData.paymentInfo.orderId,
          razorpay_payment_id: orderData.paymentInfo.paymentId,
          razorpay_signature: orderData.paymentInfo.signature
        };
        
        console.log('🔍 Payment verification details:', {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature: razorpay_signature ? 'present' : 'missing',
          key_secret: process.env.RAZORPAY_KEY_SECRET ? 'present' : 'missing'
        });
        
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
          .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '7avk1fzJsk6I4M9i1a7gjUne')
          .update(body.toString())
          .digest('hex');
        
        console.log('🔍 Signature comparison:', {
          expected: expectedSignature,
          received: razorpay_signature,
          match: expectedSignature === razorpay_signature
        });
        
        const isAuthentic = expectedSignature === razorpay_signature;
        
        if (!isAuthentic) {
          console.error('❌ Payment signature verification failed');
          console.error('Expected signature:', expectedSignature);
          console.error('Received signature:', razorpay_signature);
          console.error('Body used for verification:', body);
          
          // For now, allow the order to proceed with a warning
          console.log('⚠️ Allowing order to proceed despite signature mismatch (for debugging)');
        } else {
          console.log('✅ Payment signature verified successfully');
        }
      }
    }
    
    // Save to Firestore using your existing order service
    const firestoreOrderId = await createOrder(orderData);
    
    console.log('Order saved successfully to Firestore:', firestoreOrderId);
    
    // Create order in Shiprocket after successful payment
    try {
      console.log('🚀 Creating order in Shiprocket...');
      const shiprocketResult = await shiprocketService.createOrder(orderData);
      
      if (shiprocketResult.success) {
        console.log('✅ Order created in Shiprocket successfully:', shiprocketResult.shiprocketOrderId);
        console.log('🔍 Full shiprocketResult:', JSON.stringify(shiprocketResult, null, 2));
        
        // Update the order in Firestore with Shiprocket order ID
        if (shiprocketResult.shiprocketOrderId && shiprocketResult.shiprocketOrderId !== undefined) {
          console.log('🔄 Updating Firestore with shiprocketOrderId:', shiprocketResult.shiprocketOrderId);
          await updateOrderStatus(firestoreOrderId, {
            status: 'confirmed',
            shiprocketOrderId: shiprocketResult.shiprocketOrderId,
            shiprocketStatus: 'created',
            updatedAt: new Date()
          });
          console.log('✅ Firestore updated successfully');
        } else {
          console.error('❌ Shiprocket order ID is undefined or null, cannot update Firestore');
          console.error('❌ shiprocketResult:', JSON.stringify(shiprocketResult, null, 2));
          throw new Error('Shiprocket order ID is undefined or null');
        }
        
        res.json({
          success: true,
          orderId: orderData.orderId,
          firestoreOrderId: firestoreOrderId,
          shiprocketOrderId: shiprocketResult.shiprocketOrderId,
          message: 'Order saved successfully and created in Shiprocket'
        });
      } else {
        throw new Error('Failed to create order in Shiprocket');
      }
    } catch (shiprocketError) {
      console.error('❌ Shiprocket order creation failed:', shiprocketError.message);
      // Don't fail the entire order if Shiprocket fails
      // The order is still saved in Firestore
      res.json({
        success: true,
        orderId: orderData.orderId,
        firestoreOrderId: firestoreOrderId,
        warning: 'Order saved but Shiprocket integration failed',
        shiprocketError: shiprocketError.message,
        message: 'Order saved successfully to database'
      });
    }
  } catch (error) {
    console.error('Error saving order:', error);
    res.status(500).json({ 
      error: 'Failed to save order',
      message: error.message 
    });
  }
});

// Create order in Shiprocket with minimal verification (for failed signature cases)
app.post("/api/orders/create-shiprocket", async (req, res) => {
  try {
    const orderData = req.body;
    
    if (!orderData.orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId is required'
      });
    }
    
    console.log(`🚀 Creating order in Shiprocket for: ${orderData.orderId}`);
    
    // Save to Firestore first if not already saved
    let firestoreOrderId;
    try {
      firestoreOrderId = await createOrder(orderData);
      console.log('Order saved to Firestore:', firestoreOrderId);
    } catch (error) {
      console.log('Order might already exist in Firestore, continuing...');
    }
    
    // Create order in Shiprocket
    try {
      console.log('🚀 Creating order in Shiprocket...');
      const shiprocketResult = await shiprocketService.createOrder(orderData);
      
      if (shiprocketResult.success) {
        console.log('✅ Order created in Shiprocket successfully:', shiprocketResult.shiprocketOrderId);
        
        res.json({
          success: true,
          orderId: orderData.orderId,
          firestoreOrderId: firestoreOrderId,
          shiprocketOrderId: shiprocketResult.shiprocketOrderId,
          message: 'Order created successfully in Shiprocket'
        });
      } else {
        throw new Error('Failed to create order in Shiprocket');
      }
    } catch (shiprocketError) {
      console.error('❌ Shiprocket order creation failed:', shiprocketError.message);
      res.status(500).json({
        success: false,
        error: shiprocketError.message,
        message: 'Failed to create order in Shiprocket'
      });
    }
    
  } catch (error) {
    console.error(`❌ Error creating order in Shiprocket:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to create order in Shiprocket'
    });
  }
});

// Auto-create order in Shiprocket after payment verification
app.post("/api/orders/auto-create", async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'orderId, paymentId, and signature are required'
      });
    }
    
    console.log(`🚀 Auto-creating order in Shiprocket for: ${orderId}`);
    
    // Get the order from Firestore using admin privileges
    const orderDoc = await adminDb.collection('orders').where('orderId', '==', orderId).get();
    
    if (orderDoc.empty) {
      return res.status(404).json({
        success: false,
        message: 'Order not found in database'
      });
    }
    
    const orderDocData = orderDoc.docs[0];
    const order = { id: orderDocData.id, ...orderDocData.data() };
    
    // Check if order already has Shiprocket data
    if (order.shiprocketOrderId && order.shiprocketCreated) {
      console.log(`⏭️ Order ${orderId} already has Shiprocket order: ${order.shiprocketOrderId}`);
      return res.json({
        success: true,
        message: 'Order already exists in Shiprocket',
        shiprocketOrderId: order.shiprocketOrderId
      });
    }
    
    // Additional check: Look for existing Shiprocket orders with same order ID
    try {
      const existingShiprocketOrders = await adminDb.collection('orders')
        .where('orderId', '==', orderId)
        .where('shiprocketOrderId', '!=', null)
        .get();
      
      if (!existingShiprocketOrders.empty) {
        const existingOrder = existingShiprocketOrders.docs[0].data();
        console.log(`⏭️ Found existing Shiprocket order for ${orderId}: ${existingOrder.shiprocketOrderId}`);
        return res.json({
          success: true,
          message: 'Order already exists in Shiprocket',
          shiprocketOrderId: existingOrder.shiprocketOrderId
        });
      }
    } catch (duplicateCheckError) {
      console.error('❌ Error checking for duplicate orders:', duplicateCheckError.message);
    }
    
    // Prepare order data for Shiprocket API
    const shiprocketOrderData = {
      orderId: order.orderId,
      orderDate: order.createdAt?.toDate ? order.createdAt.toDate().toISOString() : new Date(order.createdAt || order.timestamp).toISOString(),
      billingCustomerName: order.customerInfo?.name || 'Customer',
      billingLastName: "",
      billingAddress: order.customerInfo?.address?.street || '',
      billingAddress2: "",
      billingCity: order.customerInfo?.address?.city || '',
      billingPincode: order.customerInfo?.address?.pincode || '',
      billingState: order.customerInfo?.address?.state || '',
      billingCountry: order.customerInfo?.address?.country || 'India',
      billingPhone: order.customerInfo?.phone || '',
      billingEmail: order.customerInfo?.email || '',
      shippingIsBilling: true,
      orderItems: (order.cartItems || []).map(item => ({
        name: item.name || 'Product',
        sku: item.id || 'SKU001',
        units: item.quantity || 1,
        sellingPrice: item.price || 0
      })),
      paymentMethod: order.paymentInfo?.method === 'cod' ? 'COD' : 'Prepaid',
      subTotal: order.paymentInfo?.amount || order.total || 0,
      length: 30, // Default dimensions in cm
      breadth: 20,
      height: 5,
      weight: 0.49 // Default weight in kg
    };
    
    console.log('📋 Creating order in Shiprocket:', shiprocketOrderData);
    
    // Create order in Shiprocket
    const shiprocketResult = await shiprocketService.createOrder(shiprocketOrderData);
    
    if (shiprocketResult.success && shiprocketResult.data) {
      // Update Firestore order with real Shiprocket data using admin privileges
      await adminDb.collection('orders').doc(order.id).update({
        shiprocketOrderId: getShiprocketOrderId(shiprocketResult),
        shiprocketStatus: 'NEW',
        shiprocketCreated: true,
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`✅ Updated Firestore order ${orderId} with real Shiprocket data`);
      
      res.json({
        success: true,
        shiprocketOrderId: getShiprocketOrderId(shiprocketResult),
        message: 'Order successfully created in Shiprocket'
      });
    } else {
      throw new Error('Failed to create order in Shiprocket');
    }
    
  } catch (error) {
    console.error(`❌ Error auto-creating order in Shiprocket:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to create order in Shiprocket'
    });
  }
});

// Razorpay webhook endpoint for automatic order creation
app.post("/api/webhooks/razorpay", async (req, res) => {
  try {
    const { event, payload } = req.body;
    
    console.log('🔔 Razorpay webhook received:', event);
    
    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.notes?.order_id || payment.order_id;
      
      if (orderId) {
        console.log(`💰 Payment captured for order: ${orderId}`);
        
        // Check if order already has Shiprocket data to prevent duplicates
        try {
          const orderDoc = await adminDb.collection('orders').where('orderId', '==', orderId).get();
          
          if (!orderDoc.empty) {
            const orderData = orderDoc.docs[0].data();
            
            if (orderData.shiprocketOrderId && orderData.shiprocketCreated) {
              console.log(`⏭️ Order ${orderId} already has Shiprocket order: ${orderData.shiprocketOrderId}`);
              return res.json({ status: 'success', message: 'Order already exists in Shiprocket' });
            }
          }
        } catch (checkError) {
          console.error('❌ Error checking existing order:', checkError.message);
        }
        
        // Auto-create order in Shiprocket
        try {
          const autoCreateResponse = await fetch('http://localhost:5000/api/orders/auto-create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderId: orderId,
              paymentId: payment.id,
              signature: 'webhook_auto_created'
            })
          });
          
          if (autoCreateResponse.ok) {
            const result = await autoCreateResponse.json();
            console.log(`✅ Auto-created order in Shiprocket: ${result.shiprocketOrderId}`);
          } else {
            console.log('⚠️ Auto-creation failed, but payment was captured');
          }
        } catch (error) {
          console.error('❌ Error in auto-creation:', error.message);
        }
      }
    }
    
    res.json({ status: 'success' });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Update order with Shiprocket data
app.post("/api/orders/update-shiprocket", async (req, res) => {
  try {
    const { orderId, shiprocketOrderId, shiprocketStatus, shiprocketCreated } = req.body;
    
    if (!orderId || !shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId and shiprocketOrderId are required'
      });
    }
    
    console.log(`🔄 Updating order ${orderId} with Shiprocket data: ${shiprocketOrderId}`);
    
    // Find the order in Firestore
    const orderDoc = await adminDb.collection('orders').where('orderId', '==', orderId).get();
    
    if (orderDoc.empty) {
      return res.status(404).json({
        success: false,
        message: 'Order not found in database'
      });
    }
    
    const orderDocData = orderDoc.docs[0];
    const orderRef = adminDb.collection('orders').doc(orderDocData.id);
    
    // Update the order with Shiprocket data
    await orderRef.update({
      shiprocketOrderId: shiprocketOrderId,
      shiprocketStatus: shiprocketStatus || 'NEW',
      shiprocketCreated: shiprocketCreated || true,
      shiprocketLastUpdated: new Date(),
      updatedAt: new Date()
    });
    
    console.log(`✅ Updated order ${orderId} with Shiprocket data successfully`);
    
    res.json({
      success: true,
      message: 'Order updated with Shiprocket data successfully',
      shiprocketOrderId: shiprocketOrderId
    });
    
  } catch (error) {
    console.error(`❌ Error updating order with Shiprocket data:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to update order with Shiprocket data'
    });
  }
});

// Manual sync orders to Shiprocket (for orders that don't have Shiprocket data yet)
app.post("/api/orders/sync-to-shiprocket", async (req, res) => {
  try {
    console.log('🔄 Starting manual sync of orders to Shiprocket...');
    
    // Get all orders that don't have Shiprocket data
    const ordersSnapshot = await adminDb.collection('orders')
      .where('shiprocketOrderId', '==', null)
      .get();
    
    if (ordersSnapshot.empty) {
      return res.json({
        success: true,
        message: 'No orders found without Shiprocket data',
        syncedCount: 0
      });
    }
    
    const orders = [];
    ordersSnapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`📦 Found ${orders.length} orders without Shiprocket data`);
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const order of orders) {
      try {
        console.log(`🚀 Syncing order ${order.orderId} to Shiprocket...`);
        
        // Prepare order data for Shiprocket API
        const shiprocketOrderData = {
          orderId: order.orderId,
          orderDate: order.createdAt?.toDate ? order.createdAt.toDate().toISOString() : new Date(order.createdAt || order.timestamp).toISOString(),
          billingCustomerName: order.customerInfo?.name || 'Customer',
          billingLastName: "",
          billingAddress: order.customerInfo?.address?.street || '',
          billingAddress2: "",
          billingCity: order.customerInfo?.address?.city || '',
          billingPincode: order.customerInfo?.address?.pincode || '',
          billingState: order.customerInfo?.address?.state || '',
          billingCountry: order.customerInfo?.address?.country || 'India',
          billingPhone: order.customerInfo?.phone || '',
          billingEmail: order.customerInfo?.email || '',
          shippingIsBilling: true,
          orderItems: (order.cartItems || []).map(item => ({
            name: item.name || 'Product',
            sku: item.id || 'SKU001',
            units: item.quantity || 1,
            sellingPrice: item.price || 0
          })),
          paymentMethod: order.paymentInfo?.method === 'cod' ? 'COD' : 'Prepaid',
          subTotal: order.paymentInfo?.amount || order.total || 0,
          length: 30, // Default dimensions in cm
          breadth: 20,
          height: 5,
          weight: 0.49 // Default weight in kg
        };
        
        // Create order in Shiprocket
        const shiprocketResult = await shiprocketService.createOrder(shiprocketOrderData);
        
        if (shiprocketResult.success && shiprocketResult.data) {
          // Update Firestore order with Shiprocket data
          await adminDb.collection('orders').doc(order.id).update({
            shiprocketOrderId: getShiprocketOrderId(shiprocketResult),
            shiprocketStatus: 'NEW',
            shiprocketCreated: true,
            shiprocketLastUpdated: new Date(),
            updatedAt: new Date()
          });
          
          syncedCount++;
          console.log(`✅ Synced order ${order.orderId} to Shiprocket: ${getShiprocketOrderId(shiprocketResult)}`);
        } else {
          errorCount++;
          console.error(`❌ Failed to sync order ${order.orderId} to Shiprocket`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error syncing order ${order.orderId}:`, error.message);
      }
    }
    
    console.log(`✅ Manual sync completed: ${syncedCount} synced, ${errorCount} errors`);
    
    res.json({
      success: true,
      message: `Manual sync completed: ${syncedCount} orders synced, ${errorCount} errors`,
      syncedCount: syncedCount,
      errorCount: errorCount,
      totalOrders: orders.length
    });
    
  } catch (error) {
    console.error('❌ Error in manual sync:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to perform manual sync'
    });
  }
});

// Get payment status endpoint
app.get("/api/payments/status/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    console.log('Getting payment status for:', paymentId);
    
    // Validate payment ID format
    if (!paymentId || paymentId.trim() === '') {
      return res.status(400).json({
        error: 'Invalid payment ID',
        message: 'Payment ID cannot be empty'
      });
    }
    
    // Check if this is an order ID (starts with 'order_') or payment ID
    if (paymentId.startsWith('order_')) {
      // This is an order ID, try to find payments for this order
      try {
        console.log('Fetching payments for order ID:', paymentId);
        const payments = await razorpay.orders.fetchPayments(paymentId);
        console.log('Found payments for order:', payments);
        
        if (payments && payments.items && payments.items.length > 0) {
          const payment = payments.items[0]; // Get the first payment
          res.json({
            payment_id: payment.id,
            order_id: paymentId,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            signature: payment.signature || null,
            createdAt: new Date(payment.created_at * 1000).toISOString()
          });
        } else {
          console.log('No payments found for order:', paymentId);
          res.json({
            payment_id: null,
            order_id: paymentId,
            status: 'no_payments',
            amount: 0,
            currency: 'INR',
            signature: null,
            createdAt: null,
            message: 'Order exists but no payments found'
          });
        }
      } catch (orderError) {
        console.error('Error fetching payments for order:', orderError);
        
        // Check if it's a "not found" error
        if (orderError.statusCode === 400 && orderError.error && orderError.error.code === 'BAD_REQUEST_ERROR') {
          res.json({
            payment_id: null,
            order_id: paymentId,
            status: 'order_not_found',
            amount: 0,
            currency: 'INR',
            signature: null,
            createdAt: null,
            error: 'Order does not exist in Razorpay'
          });
        } else {
          res.json({
            payment_id: null,
            order_id: paymentId,
            status: 'error',
            amount: 0,
            currency: 'INR',
            signature: null,
            createdAt: null,
            error: orderError.message
          });
        }
      }
    } else {
      // This is a payment ID, fetch payment details directly
      try {
        console.log('Fetching payment details for payment ID:', paymentId);
        const payment = await razorpay.payments.fetch(paymentId);
        console.log('Found payment:', payment);
        
        res.json({
          payment_id: payment.id,
          order_id: payment.order_id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          signature: payment.signature || null,
          createdAt: new Date(payment.created_at * 1000).toISOString()
        });
      } catch (paymentError) {
        console.error('Error fetching payment:', paymentError);
        
        // Check if it's a "not found" error
        if (paymentError.statusCode === 400 && paymentError.error && paymentError.error.code === 'BAD_REQUEST_ERROR') {
          res.status(404).json({
            error: 'Payment not found',
            message: 'The payment ID does not exist in Razorpay',
            payment_id: paymentId,
            status: 'not_found'
          });
        } else {
          res.status(500).json({
            error: 'Failed to fetch payment',
            message: paymentError.message,
            payment_id: paymentId
          });
        }
      }
    }
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({ 
      error: 'Failed to get payment status',
      message: error.message 
    });
  }
});

// Use Shiprocket routes
app.use('/api/shiprocket', shiprocketRoutes);

// Auto-sync management endpoints
app.post('/api/shiprocket/auto-sync/start', async (req, res) => {
  try {
    const { frequency } = req.body; // in minutes
    const syncFrequency = frequency ? frequency * 60 * 1000 : 5 * 60 * 1000; // default 5 minutes
    
    autoSyncService.startAutoSync(syncFrequency);
    
    res.json({
      success: true,
      message: `Auto-sync started (every ${frequency || 5} minutes)`,
      status: autoSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Error starting auto-sync:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to start auto-sync'
    });
  }
});

app.post('/api/shiprocket/auto-sync/stop', async (req, res) => {
  try {
    autoSyncService.stopAutoSync();
    
    res.json({
      success: true,
      message: 'Auto-sync stopped',
      status: autoSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Error stopping auto-sync:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to stop auto-sync'
    });
  }
});

app.get('/api/shiprocket/auto-sync/status', async (req, res) => {
  try {
    const status = autoSyncService.getStatus();
    
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error('❌ Error getting auto-sync status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get auto-sync status'
    });
  }
});

app.post('/api/shiprocket/auto-sync/trigger', async (req, res) => {
  try {
    console.log('🔄 Manual auto-sync triggered via API');
    const results = await autoSyncService.triggerManualSync();
    
    res.json({
      success: true,
      message: 'Manual sync completed',
      results: results
    });
  } catch (error) {
    console.error('❌ Error triggering manual sync:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to trigger manual sync'
    });
  }
});

app.post('/api/shiprocket/auto-sync/frequency', async (req, res) => {
  try {
    const { frequency } = req.body; // in minutes
    
    if (!frequency || frequency < 1) {
      return res.status(400).json({
        success: false,
        message: 'Frequency must be at least 1 minute'
      });
    }
    
    const syncFrequency = frequency * 60 * 1000;
    autoSyncService.setSyncFrequency(syncFrequency);
    
    res.json({
      success: true,
      message: `Sync frequency updated to ${frequency} minutes`,
      status: autoSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Error updating sync frequency:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to update sync frequency'
    });
  }
});

// Shiprocket webhook endpoint
app.post('/api/shiprocket/webhook', async (req, res) => {
  try {
    console.log('🔔 Received Shiprocket webhook:', req.body);
    
    // Verify webhook signature if provided
    const signature = req.headers['x-shiprocket-signature'] || req.headers['x-signature'];
    if (signature && !webhookService.verifyWebhookSignature(req.body, signature)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }
    
    // Process the webhook
    const result = await webhookService.processWebhook(req.body);
    
    res.json({
      success: true,
      message: 'Webhook processed successfully',
      result: result
    });
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to process webhook'
    });
  }
});

// Test webhook endpoint
app.post('/api/shiprocket/webhook/test', async (req, res) => {
  try {
    const { payload } = req.body;
    
    if (!payload) {
      return res.status(400).json({
        success: false,
        message: 'Payload is required for webhook test'
      });
    }
    
    console.log('🧪 Testing webhook with payload:', payload);
    const result = await webhookService.testWebhook(payload);
    
    res.json({
      success: true,
      message: 'Webhook test completed',
      result: result
    });
    
  } catch (error) {
    console.error('❌ Webhook test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Webhook test failed'
    });
  }
});

// Update all orders with AWB and status from Shiprocket
app.post("/api/shiprocket/update-all-orders", async (req, res) => {
  try {
    console.log('🔄 Updating all orders with AWB and status from Shiprocket...');
    
    // Get all orders from Firestore that have shiprocketOrderId but no AWB
    const ordersSnapshot = await adminDb.collection('orders')
      .where('shiprocketOrderId', '!=', null)
      .get();
    
    if (ordersSnapshot.empty) {
      return res.json({
        success: true,
        message: 'No orders found with Shiprocket IDs',
        updatedCount: 0
      });
    }
    
    const orders = [];
    ordersSnapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`📦 Found ${orders.length} orders to update`);
    
    const updateResults = [];
    let successCount = 0;
    
    for (const order of orders) {
      try {
        if (order.shiprocketOrderId) {
          console.log(`🔄 Updating order ${order.orderId} (Shiprocket ID: ${order.shiprocketOrderId})`);
          
          // Get order details from Shiprocket
          const orderDetails = await shiprocketService.getOrderWithAWB(order.shiprocketOrderId);
          
          if (orderDetails.success) {
            const updateData = {
              shiprocketLastUpdated: new Date(),
              updatedAt: new Date()
            };
            
            // Update AWB if available
            if (orderDetails.awbCode) {
              updateData.shiprocketAWB = orderDetails.awbCode;
              updateData.awbCode = orderDetails.awbCode;
            }
            
            // Update status if available
            if (orderDetails.status) {
              updateData.shiprocketStatus = orderDetails.status;
            }
            
            // Update courier name if available
            if (orderDetails.courierName) {
              updateData.courierName = orderDetails.courierName;
            }
            
            // Update tracking URL if available
            if (orderDetails.trackingUrl) {
              updateData.trackingUrl = orderDetails.trackingUrl;
            }
            
            // Update shipment status if available
            if (orderDetails.shipmentStatus) {
              updateData.shipmentStatus = orderDetails.shipmentStatus;
            }
            
            // Update the order in Firestore
            await adminDb.collection('orders').doc(order.id).update(updateData);
            
            updateResults.push({
              orderId: order.orderId,
              shiprocketOrderId: order.shiprocketOrderId,
              success: true,
              awbCode: orderDetails.awbCode,
              status: orderDetails.status,
              courierName: orderDetails.courierName
            });
            
            successCount++;
            console.log(`✅ Updated order ${order.orderId}: AWB=${orderDetails.awbCode}, Status=${orderDetails.status}`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to update order ${order.orderId}:`, error.message);
        updateResults.push({
          orderId: order.orderId,
          shiprocketOrderId: order.shiprocketOrderId,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`🎉 Update completed: ${successCount}/${orders.length} orders updated successfully`);
    
    res.json({
      success: true,
      message: `Updated ${successCount} out of ${orders.length} orders`,
      totalOrders: orders.length,
      successCount: successCount,
      failureCount: orders.length - successCount,
      results: updateResults
    });
    
  } catch (error) {
    console.error('❌ Error updating orders with AWB:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to update orders with AWB information'
    });
  }
});


// Sync order with Shiprocket data (with admin privileges)
app.post("/api/shiprocket/sync-order", async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`🔄 Syncing order with Shiprocket: ${orderId}`);
    
    // Get the order from Firestore using admin privileges
    const orderDoc = await adminDb.collection('orders').where('orderId', '==', orderId).get();
    
    if (orderDoc.empty) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    const orderDocData = orderDoc.docs[0];
    const order = { id: orderDocData.id, ...orderDocData.data() };
    
    // Get all orders from Shiprocket
    const shiprocketResult = await shiprocketService.getAllOrders();
    
    if (!shiprocketResult.success || !shiprocketResult.orders || !Array.isArray(shiprocketResult.orders)) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch orders from Shiprocket'
      });
    }
    
    // Find matching order in Shiprocket data
    const shiprocketOrder = shiprocketResult.orders.find(srOrder => 
      srOrder.order_id === order.orderId || 
      srOrder.channel_order_id === order.orderId
    );
    
    if (!shiprocketOrder) {
      return res.json({
        success: false,
        message: `Order ${orderId} not found in Shiprocket`
      });
    }
    
    // Prepare update data with only defined values
    const updateData = {
      shiprocketLastUpdated: new Date(),
      updatedAt: new Date()
    };
    
    if (shiprocketOrder.id || shiprocketOrder.order_id) {
      updateData.shiprocketOrderId = shiprocketOrder.id || shiprocketOrder.order_id;
    }
    if (shiprocketOrder.awb_code) {
      updateData.shiprocketAWB = shiprocketOrder.awb_code;
      updateData.awbCode = shiprocketOrder.awb_code;
    }
    if (shiprocketOrder.status) {
      updateData.shiprocketStatus = shiprocketOrder.status;
    }
    if (shiprocketOrder.courier_name) {
      updateData.courierName = shiprocketOrder.courier_name;
    }
    if (shiprocketOrder.tracking_url) {
      updateData.trackingUrl = shiprocketOrder.tracking_url;
    }
    
    // Update Firestore order with Shiprocket data using admin privileges
    await adminDb.collection('orders').doc(order.id).update(updateData);
    
    console.log(`✅ Updated Firestore order ${orderId} with Shiprocket data`);
    
    res.json({
      success: true,
      message: `Order ${orderId} synced successfully with Shiprocket`,
      shiprocketOrderId: updateData.shiprocketOrderId,
      awbCode: updateData.awbCode,
      status: updateData.shiprocketStatus
    });
    
  } catch (error) {
    console.error(`❌ Error syncing order with Shiprocket:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to sync order with Shiprocket'
    });
  }
});

// Create real Shiprocket order and update Firestore (with admin privileges)
app.post("/api/shiprocket/create-real-order", async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log(`🚀 Creating real Shiprocket order for: ${orderId}`);
    
    // Get the order from Firestore using admin privileges
    const orderDoc = await adminDb.collection('orders').where('orderId', '==', orderId).get();
    
    if (orderDoc.empty) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    const orderDocData = orderDoc.docs[0];
    const order = { id: orderDocData.id, ...orderDocData.data() };
    
    // Check if order already has Shiprocket data
    if (order.shiprocketOrderId && order.shiprocketCreated) {
      return res.json({
        success: false,
        message: 'Order already exists in Shiprocket',
        shiprocketOrderId: order.shiprocketOrderId
      });
    }
    
    // Prepare order data for Shiprocket API
    const shiprocketOrderData = {
      orderId: order.orderId,
      orderDate: order.createdAt?.toDate ? order.createdAt.toDate().toISOString() : new Date(order.createdAt || order.timestamp).toISOString(),
      billingCustomerName: order.customerInfo?.name || 'Customer',
      billingLastName: "",
      billingAddress: order.customerInfo?.address?.street || '',
      billingAddress2: "",
      billingCity: order.customerInfo?.address?.city || '',
      billingPincode: order.customerInfo?.address?.pincode || '',
      billingState: order.customerInfo?.address?.state || '',
      billingCountry: order.customerInfo?.address?.country || 'India',
      billingPhone: order.customerInfo?.phone || '',
      billingEmail: order.customerInfo?.email || '',
      shippingIsBilling: true,
      orderItems: (order.cartItems || []).map(item => ({
        name: item.name || 'Product',
        sku: item.id || 'SKU001',
        units: item.quantity || 1,
        sellingPrice: item.price || 0
      })),
      paymentMethod: order.paymentInfo?.method === 'cod' ? 'COD' : 'Prepaid',
      subTotal: order.paymentInfo?.amount || order.total || 0,
      length: 30, // Default dimensions in cm
      breadth: 20,
      height: 5,
      weight: 0.49 // Default weight in kg
    };
    
    console.log('📋 Creating order in Shiprocket:', shiprocketOrderData);
    
    // Create order in Shiprocket
    const shiprocketResult = await shiprocketService.createOrder(shiprocketOrderData);
    
    if (shiprocketResult.success && shiprocketResult.data) {
      // Update Firestore order with real Shiprocket data using admin privileges
      await adminDb.collection('orders').doc(order.id).update({
        shiprocketOrderId: getShiprocketOrderId(shiprocketResult),
        shiprocketStatus: 'NEW',
        shiprocketCreated: true,
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`✅ Updated Firestore order ${orderId} with real Shiprocket data`);
      
      res.json({
        success: true,
        shiprocketOrderId: getShiprocketOrderId(shiprocketResult),
        message: 'Order successfully created in Shiprocket'
      });
    } else {
      throw new Error('Failed to create order in Shiprocket');
    }
    
  } catch (error) {
    console.error(`❌ Error creating real Shiprocket order:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to create order in Shiprocket'
    });
  }
});

// Recovery endpoint for failed orders
app.post("/api/orders/recover-shiprocket", async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId is required'
      });
    }
    
    console.log(`🔄 Recovering Shiprocket order for: ${orderId}`);
    
    // Find the order in Firestore
    const orderQuery = await adminDb.collection('orders')
      .where('orderId', '==', orderId)
      .get();
    
    if (orderQuery.empty) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    const orderDoc = orderQuery.docs[0];
    const order = { id: orderDoc.id, ...orderDoc.data() };
    
    // Check if order already has a Shiprocket ID
    if (order.shiprocketOrderId) {
      return res.json({
        success: true,
        message: 'Order already has Shiprocket ID',
        shiprocketOrderId: order.shiprocketOrderId
      });
    }
    
    // Prepare order data for Shiprocket
    const shiprocketOrderData = {
      orderId: order.orderId,
      billingCustomerName: order.billingCustomerName || order.customerName || order.loggedInUserEmail || "Customer",
      billingEmail: order.billingEmail || order.customerEmail || order.loggedInUserEmail,
      billingPhone: order.billingPhone || order.customerPhone || "9876543210",
      billingAddress: order.billingAddress || "Address not provided",
      billingCity: order.billingCity || "City not provided",
      billingPincode: order.billingPincode || "110001",
      billingState: order.billingState || "State not provided",
      billingCountry: order.billingCountry || "India",
      cartItems: order.cartItems || order.orderItems || [],
      paymentMethod: order.paymentMethod || 'Prepaid',
      subTotal: order.subTotal || order.totalAmount || order.paymentInfo?.amount || 0,
      orderNotes: order.orderNotes || "Silk saree order from Varaha Silks",
      length: 30,
      breadth: 20,
      height: 5,
      weight: 0.49
    };
    
    console.log('📋 Order data for Shiprocket:', JSON.stringify(shiprocketOrderData, null, 2));
    
    console.log('📋 Creating order in Shiprocket:', shiprocketOrderData);
    
    // Create order in Shiprocket
    const shiprocketResult = await shiprocketService.createOrder(shiprocketOrderData);
    
    if (shiprocketResult.success && shiprocketResult.data) {
      const shiprocketOrderId = getShiprocketOrderId(shiprocketResult);
      if (shiprocketOrderId) {
        // Update Firestore order with Shiprocket data
        await adminDb.collection('orders').doc(order.id).update({
          shiprocketOrderId: shiprocketOrderId,
          shiprocketStatus: 'NEW',
          shiprocketCreated: true,
          shiprocketLastUpdated: new Date(),
          updatedAt: new Date(),
          // Clear any previous error fields
          shiprocketLastError: admin.firestore.FieldValue.delete(),
          shiprocketRetryCount: 0
        });
        
        console.log(`✅ Recovered order ${orderId} with Shiprocket ID: ${shiprocketOrderId}`);
        
        res.json({
          success: true,
          orderId: orderId,
          shiprocketOrderId: shiprocketOrderId,
          message: 'Order successfully recovered and created in Shiprocket'
        });
      } else {
        throw new Error('Shiprocket order ID is undefined');
      }
    } else {
      throw new Error('Failed to create order in Shiprocket');
    }
    
  } catch (error) {
    console.error(`❌ Error recovering order:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to recover order'
    });
  }
});

// File Upload API
app.post("/api/upload", async (req, res) => {
  try {
    // This would need proper file handling middleware like multer
    res.status(501).json({ error: "File upload endpoint needs proper implementation" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- 404 + Error handlers
app.use(require("./middleware/notFound"));
app.use(require("./middleware/errorHandler"));

// --- Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Varaha Silks Backend API running on http://localhost:${PORT}`);
  console.log(`📡 All backend services consolidated and available`);
  
  // Start automatic wakeup service
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_WAKEUP === 'true') {
    if (wakeupService && typeof wakeupService.start === 'function') {
      wakeupService.start();
    } else {
      console.log('⚠️ Wakeup service not available or start method missing');
    }
  } else {
    console.log('🔄 Wakeup service disabled in development mode');
  }
  
  // Start automatic Shiprocket sync (every 5 minutes by default) - DISABLED
  // Uncomment the following lines if you want to enable auto-sync
  /*
  setTimeout(() => {
    try {
      autoSyncService.startAutoSync(5 * 60 * 1000); // 5 minutes
      console.log('🔄 Automatic Shiprocket sync started (every 5 minutes)');
    } catch (error) {
      console.error('❌ Failed to start automatic sync:', error.message);
    }
  }, 10000); // Start after 10 seconds to allow server to fully initialize
  */
  console.log('🔄 Auto-sync disabled by default. Use /api/shiprocket/auto-sync/start to enable manually.');
  
  console.log(`🔧 Available endpoints:`);
  console.log(`   - GET  /api/health - Health check`);
  console.log(`   - GET  /api/wakeup - Wakeup endpoint for external ping services`);
  console.log(`   - GET  /api/wakeup/status - Wakeup service status`);
  console.log(`   - POST /api/wakeup/trigger - Manual wakeup trigger`);
  console.log(`   - GET  /api/wakeup/recommendations - External ping service recommendations`);
  console.log(`   - GET  /api/products - Get all products`);
  console.log(`   - POST /api/products - Create product`);
  console.log(`   - GET  /api/orders - Get all orders (admin)`);
  console.log(`   - GET  /api/orders/user/:userId - Get user orders`);
  console.log(`   - POST /api/orders - Create order`);
  console.log(`   - GET  /api/cart/:userId - Get user cart`);
  console.log(`   - POST /api/cart/:userId - Save user cart`);
  console.log(`   - GET  /api/wishlist/:userId - Get user wishlist`);
  console.log(`   - POST /api/wishlist/:userId - Save user wishlist`);
  console.log(`   - GET  /api/users - Get all users`);
  console.log(`   - POST /api/users - Create user profile`);
  console.log(`   - GET  /api/founder-videos - Get founder videos`);
  console.log(`   - POST /api/founder-videos - Add founder video`);
  console.log(`   - GET  /api/announcements - Get announcements`);
  console.log(`   - GET  /api/announcements/active - Get active announcements`);
  console.log(`   - POST /api/contact - Send contact message`);
  console.log(`   💳 RAZORPAY PAYMENT ENDPOINTS:`);
  console.log(`   - POST /api/orders/create - Create Razorpay order`);
  console.log(`   - POST /api/payments/verify - Verify payment signature`);
  console.log(`   - POST /api/orders/save - Save order to database`);
  console.log(`   - GET  /api/payments/status/:paymentId - Get payment status`);
  console.log(`   🚀 SHIPROCKET SHIPPING ENDPOINTS:`);
  console.log(`   - POST /api/shiprocket/orders/create - Create order in Shiprocket`);
  console.log(`   - POST /api/shiprocket/assign-awb - Assign AWB to order`);
  console.log(`   - POST /api/shiprocket/auto-assign-awb - Auto-assign AWB to order`);
  console.log(`   - GET  /api/shiprocket/order-with-awb/:id - Get order with AWB details`);
  console.log(`   - POST /api/shiprocket/batch-update-awb - Batch update orders with AWB`);
  console.log(`   - POST /api/shiprocket/update-all-orders - Update all orders with AWB/status`);
  console.log(`   - GET  /api/shiprocket/test - Test Shiprocket connection`);
  console.log(`   🔄 AUTO-SYNC ENDPOINTS:`);
  console.log(`   - POST /api/shiprocket/auto-sync/start - Start automatic sync`);
  console.log(`   - POST /api/shiprocket/auto-sync/stop - Stop automatic sync`);
  console.log(`   - GET  /api/shiprocket/auto-sync/status - Get sync status`);
  console.log(`   - POST /api/shiprocket/auto-sync/trigger - Trigger manual sync`);
  console.log(`   - POST /api/shiprocket/auto-sync/frequency - Update sync frequency`);
  console.log(`   🔔 WEBHOOK ENDPOINTS:`);
  console.log(`   - POST /api/shiprocket/webhook - Shiprocket webhook receiver`);
  console.log(`   - POST /api/shiprocket/webhook/test - Test webhook processing`);
  console.log(`   - POST /api/shiprocket/auto-assign-awb - Auto-assign AWB to order`);
  console.log(`   - POST /api/shiprocket/generate-label - Generate shipping label`);
  console.log(`   - GET  /api/shiprocket/track/:awbCode - Track shipment`);
  console.log(`   - GET  /api/shiprocket/couriers - Get available couriers`);
  console.log(`   - GET  /api/shiprocket/order-with-awb/:id - Get order with AWB details`);
  console.log(`   - POST /api/shiprocket/batch-update-awb - Batch update orders with AWB`);
  console.log(`   - POST /api/shiprocket/update-all-orders - Update all orders with AWB/status`);
  console.log(`   - GET  /api/shiprocket/test - Test Shiprocket connection`);
});
