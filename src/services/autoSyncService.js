const shiprocketService = require('./shiprocketService');
const { db: adminDb } = require('../config/firebase');

class AutoSyncService {
  constructor() {
    this.isRunning = false;
    this.syncInterval = null;
    this.lastSyncTime = null;
    this.syncFrequency = 5 * 60 * 1000; // 5 minutes default
  }

  // Start automatic synchronization
  startAutoSync(frequency = 5 * 60 * 1000) {
    if (this.isRunning) {
      console.log('🔄 Auto-sync is already running');
      return;
    }

    this.syncFrequency = frequency;
    this.isRunning = true;
    
    console.log(`🚀 Starting automatic Shiprocket sync (every ${frequency / 1000 / 60} minutes)`);
    
    // Run initial sync immediately
    this.performSync();
    
    // Set up recurring sync
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, this.syncFrequency);
  }

  // Stop automatic synchronization
  stopAutoSync() {
    if (!this.isRunning) {
      console.log('🔄 Auto-sync is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    console.log('⏹️ Automatic Shiprocket sync stopped');
  }

  // Get sync status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncFrequency: this.syncFrequency,
      nextSyncIn: this.isRunning ? this.syncFrequency - (Date.now() - this.lastSyncTime) : null
    };
  }

  // Perform synchronization
  async performSync() {
    try {
      console.log('🔄 Starting automatic Shiprocket synchronization...');
      this.lastSyncTime = new Date();
      
      const results = {
        ordersCreated: 0,
        ordersUpdated: 0,
        awbAssigned: 0,
        errors: 0,
        startTime: this.lastSyncTime
      };

      // 1. Sync all existing orders with AWB and status
      await this.syncExistingOrders(results);
      
      // 2. Auto-assign AWB to orders without AWB
      await this.autoAssignMissingAWB(results);
      
      // 3. Update order statuses
      await this.updateOrderStatuses(results);
      
      // 4. Sync new orders from Shiprocket (if any)
      await this.syncNewOrders(results);
      
      const endTime = new Date();
      const duration = endTime - results.startTime;
      
      console.log(`✅ Auto-sync completed in ${duration}ms:`, {
        ordersCreated: results.ordersCreated,
        ordersUpdated: results.ordersUpdated,
        awbAssigned: results.awbAssigned,
        errors: results.errors
      });
      
      return results;
      
    } catch (error) {
      console.error('❌ Auto-sync failed:', error);
      throw error;
    }
  }

  // Sync existing orders with AWB and status
  async syncExistingOrders(results) {
    try {
      console.log('📦 Syncing existing orders with AWB and status...');
      
      // Get all orders that have shiprocketOrderId
      const ordersSnapshot = await adminDb.collection('orders')
        .where('shiprocketOrderId', '!=', null)
        .get();
      
      if (ordersSnapshot.empty) {
        console.log('📭 No orders found with Shiprocket IDs');
        return;
      }
      
      const orders = [];
      ordersSnapshot.forEach(doc => {
        orders.push({ id: doc.id, ...doc.data() });
      });
      
      console.log(`🔄 Found ${orders.length} orders to sync`);
      
      for (const order of orders) {
        try {
          if (order.shiprocketOrderId) {
            // Get latest order details from Shiprocket
            const orderDetails = await shiprocketService.getOrderWithAWB(order.shiprocketOrderId);
            
            if (orderDetails.success) {
              const updateData = {
                shiprocketLastUpdated: new Date(),
                updatedAt: new Date()
              };
              
              let hasUpdates = false;
              
              // Update AWB if available and different
              if (orderDetails.awbCode && orderDetails.awbCode !== order.shiprocketAWB) {
                updateData.shiprocketAWB = orderDetails.awbCode;
                updateData.awbCode = orderDetails.awbCode;
                hasUpdates = true;
                console.log(`📦 Updated AWB for order ${order.orderId}: ${orderDetails.awbCode}`);
              }
              
              // Update status if available and different
              if (orderDetails.status && orderDetails.status !== order.shiprocketStatus) {
                updateData.shiprocketStatus = orderDetails.status;
                hasUpdates = true;
                console.log(`📊 Updated status for order ${order.orderId}: ${orderDetails.status}`);
              }
              
              // Update courier name if available and different
              if (orderDetails.courierName && orderDetails.courierName !== order.courierName) {
                updateData.courierName = orderDetails.courierName;
                hasUpdates = true;
              }
              
              // Update tracking URL if available and different
              if (orderDetails.trackingUrl && orderDetails.trackingUrl !== order.trackingUrl) {
                updateData.trackingUrl = orderDetails.trackingUrl;
                hasUpdates = true;
              }
              
              // Update shipment status if available and different
              if (orderDetails.shipmentStatus && orderDetails.shipmentStatus !== order.shipmentStatus) {
                updateData.shipmentStatus = orderDetails.shipmentStatus;
                hasUpdates = true;
              }
              
              // Only update if there are changes
              if (hasUpdates) {
                await adminDb.collection('orders').doc(order.id).update(updateData);
                results.ordersUpdated++;
              }
            }
          }
        } catch (error) {
          console.error(`❌ Failed to sync order ${order.orderId}:`, error.message);
          results.errors++;
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to sync existing orders:', error);
      results.errors++;
    }
  }

  // Auto-assign AWB to orders without AWB
  async autoAssignMissingAWB(results) {
    try {
      console.log('🚀 Auto-assigning AWB to orders without AWB...');
      
      // Get orders that have shiprocketOrderId but no AWB
      const ordersSnapshot = await adminDb.collection('orders')
        .where('shiprocketOrderId', '!=', null)
        .where('shiprocketAWB', '==', null)
        .get();
      
      if (ordersSnapshot.empty) {
        console.log('📭 No orders found without AWB');
        return;
      }
      
      const orders = [];
      ordersSnapshot.forEach(doc => {
        orders.push({ id: doc.id, ...doc.data() });
      });
      
      console.log(`🔄 Found ${orders.length} orders without AWB`);
      
      for (const order of orders) {
        try {
          if (order.shiprocketOrderId && order.customerInfo?.address?.pincode) {
            console.log(`🚀 Auto-assigning AWB to order ${order.orderId}...`);
            
            const awbResult = await shiprocketService.autoAssignAWB(
              order.shiprocketOrderId,
              order.customerInfo.address.pincode,
              0.5 // Default weight
            );
            
            if (awbResult.success) {
              // Update order with AWB details
              await adminDb.collection('orders').doc(order.id).update({
                shiprocketAWB: awbResult.awbCode,
                awbCode: awbResult.awbCode,
                courierName: awbResult.courierName,
                shiprocketStatus: 'AWB_ASSIGNED',
                shiprocketLastUpdated: new Date(),
                updatedAt: new Date()
              });
              
              results.awbAssigned++;
              console.log(`✅ AWB assigned to order ${order.orderId}: ${awbResult.awbCode} via ${awbResult.courierName}`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to auto-assign AWB to order ${order.orderId}:`, error.message);
          results.errors++;
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to auto-assign missing AWB:', error);
      results.errors++;
    }
  }

  // Update order statuses
  async updateOrderStatuses(results) {
    try {
      console.log('📊 Updating order statuses...');
      
      // Get all orders with shiprocketOrderId
      const ordersSnapshot = await adminDb.collection('orders')
        .where('shiprocketOrderId', '!=', null)
        .get();
      
      if (ordersSnapshot.empty) {
        return;
      }
      
      const orders = [];
      ordersSnapshot.forEach(doc => {
        orders.push({ id: doc.id, ...doc.data() });
      });
      
      for (const order of orders) {
        try {
          if (order.shiprocketOrderId) {
            // Get order status from Shiprocket
            const orderStatus = await shiprocketService.getOrderStatus(order.shiprocketOrderId);
            
            if (orderStatus.success && orderStatus.orderDetails) {
              const newStatus = orderStatus.orderDetails.status;
              const currentStatus = order.shiprocketStatus;
              
              if (newStatus && newStatus !== currentStatus) {
                await adminDb.collection('orders').doc(order.id).update({
                  shiprocketStatus: newStatus,
                  shiprocketLastUpdated: new Date(),
                  updatedAt: new Date()
                });
                
                console.log(`📊 Updated status for order ${order.orderId}: ${currentStatus} → ${newStatus}`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Failed to update status for order ${order.orderId}:`, error.message);
          results.errors++;
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to update order statuses:', error);
      results.errors++;
    }
  }

  // Sync new orders from Shiprocket (if any)
  async syncNewOrders(results) {
    try {
      console.log('🆕 Checking for new orders in Shiprocket...');
      
      // Get all orders from Shiprocket
      const shiprocketOrders = await shiprocketService.getAllOrders();
      
      if (!shiprocketOrders.success || !shiprocketOrders.orders) {
        return;
      }
      
      // Get all existing order IDs from Firestore
      const existingOrdersSnapshot = await adminDb.collection('orders')
        .where('shiprocketOrderId', '!=', null)
        .get();
      
      const existingShiprocketIds = new Set();
      existingOrdersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.shiprocketOrderId) {
          existingShiprocketIds.add(data.shiprocketOrderId.toString());
        }
      });
      
      // Find new orders
      const newOrders = shiprocketOrders.orders.filter(srOrder => {
        const srOrderId = (srOrder.id || srOrder.order_id).toString();
        return !existingShiprocketIds.has(srOrderId);
      });
      
      if (newOrders.length > 0) {
        console.log(`🆕 Found ${newOrders.length} new orders in Shiprocket`);
        
        for (const srOrder of newOrders) {
          try {
            // Create a basic order record in Firestore
            const orderData = {
              orderId: srOrder.order_id || srOrder.channel_order_id,
              shiprocketOrderId: srOrder.id || srOrder.order_id,
              shiprocketStatus: srOrder.status || 'NEW',
              shiprocketAWB: srOrder.awb_code || null,
              awbCode: srOrder.awb_code || null,
              courierName: srOrder.courier_name || null,
              trackingUrl: srOrder.tracking_url || null,
              shiprocketCreated: true,
              shiprocketLastUpdated: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
              source: 'shiprocket_sync'
            };
            
            await adminDb.collection('orders').add(orderData);
            results.ordersCreated++;
            
            console.log(`✅ Created new order record: ${orderData.orderId}`);
          } catch (error) {
            console.error(`❌ Failed to create order record for ${srOrder.order_id}:`, error.message);
            results.errors++;
          }
        }
      } else {
        console.log('📭 No new orders found in Shiprocket');
      }
      
    } catch (error) {
      console.error('❌ Failed to sync new orders:', error);
      results.errors++;
    }
  }

  // Manual sync trigger
  async triggerManualSync() {
    console.log('🔄 Manual sync triggered');
    return await this.performSync();
  }

  // Set sync frequency
  setSyncFrequency(frequency) {
    this.syncFrequency = frequency;
    
    if (this.isRunning) {
      this.stopAutoSync();
      this.startAutoSync(frequency);
    }
    
    console.log(`⏰ Sync frequency updated to ${frequency / 1000 / 60} minutes`);
  }
}

module.exports = new AutoSyncService();
