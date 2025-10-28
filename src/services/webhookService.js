const { db: adminDb } = require('../config/firebase');
const shiprocketService = require('./shiprocketService');

class WebhookService {
  constructor() {
    this.webhookSecret = process.env.SHIPROCKET_WEBHOOK_SECRET || 'default-secret';
  }

  // Verify webhook signature (if Shiprocket provides one)
  verifyWebhookSignature(payload, signature) {
    // This is a placeholder - implement actual signature verification if Shiprocket provides it
    // For now, we'll accept all webhooks
    return true;
  }

  // Process Shiprocket webhook
  async processWebhook(payload) {
    try {
      console.log('🔔 Processing Shiprocket webhook:', JSON.stringify(payload, null, 2));
      
      const { event, data } = payload;
      
      switch (event) {
        case 'order.created':
          await this.handleOrderCreated(data);
          break;
          
        case 'order.updated':
          await this.handleOrderUpdated(data);
          break;
          
        case 'awb.assigned':
          await this.handleAWBAssigned(data);
          break;
          
        case 'shipment.dispatched':
          await this.handleShipmentDispatched(data);
          break;
          
        case 'shipment.delivered':
          await this.handleShipmentDelivered(data);
          break;
          
        case 'shipment.failed':
          await this.handleShipmentFailed(data);
          break;
          
        case 'tracking.updated':
          await this.handleTrackingUpdated(data);
          break;
          
        default:
          console.log(`⚠️ Unknown webhook event: ${event}`);
      }
      
      return { success: true, message: `Webhook processed: ${event}` };
      
    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      throw error;
    }
  }

  // Handle order created event
  async handleOrderCreated(data) {
    try {
      console.log('📦 Processing order created webhook:', data);
      
      const { order_id, channel_order_id } = data;
      const orderId = order_id || channel_order_id;
      
      if (!orderId) {
        throw new Error('No order ID found in webhook data');
      }
      
      // Check if order already exists in Firestore
      const existingOrder = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', orderId)
        .get();
      
      if (!existingOrder.empty) {
        console.log(`📦 Order ${orderId} already exists in Firestore`);
        return;
      }
      
      // Get detailed order information from Shiprocket
      const orderDetails = await shiprocketService.getOrderWithAWB(orderId);
      
      if (orderDetails.success) {
        // Create order record in Firestore
        const orderData = {
          orderId: orderDetails.data.order_id || orderId,
          shiprocketOrderId: orderId,
          shiprocketStatus: orderDetails.data.status || 'NEW',
          shiprocketAWB: orderDetails.data.awb_code || null,
          awbCode: orderDetails.data.awb_code || null,
          courierName: orderDetails.data.courier_name || null,
          trackingUrl: orderDetails.data.tracking_url || null,
          shiprocketCreated: true,
          shiprocketLastUpdated: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'shiprocket_webhook'
        };
        
        await adminDb.collection('orders').add(orderData);
        console.log(`✅ Created order record from webhook: ${orderData.orderId}`);
      }
      
    } catch (error) {
      console.error('❌ Error handling order created webhook:', error);
      throw error;
    }
  }

  // Handle order updated event
  async handleOrderUpdated(data) {
    try {
      console.log('📝 Processing order updated webhook:', data);
      
      const { order_id, channel_order_id } = data;
      const orderId = order_id || channel_order_id;
      
      if (!orderId) {
        throw new Error('No order ID found in webhook data');
      }
      
      // Find the order in Firestore
      const orderQuery = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', orderId)
        .get();
      
      if (orderQuery.empty) {
        console.log(`📦 Order ${orderId} not found in Firestore, creating new record`);
        await this.handleOrderCreated(data);
        return;
      }
      
      const orderDoc = orderQuery.docs[0];
      const orderData = orderDoc.data();
      
      // Get latest order details from Shiprocket
      const orderDetails = await shiprocketService.getOrderWithAWB(orderId);
      
      if (orderDetails.success) {
        const updateData = {
          shiprocketLastUpdated: new Date(),
          updatedAt: new Date()
        };
        
        let hasUpdates = false;
        
        // Update status if changed
        if (orderDetails.data.status && orderDetails.data.status !== orderData.shiprocketStatus) {
          updateData.shiprocketStatus = orderDetails.data.status;
          hasUpdates = true;
          console.log(`📊 Status updated: ${orderData.shiprocketStatus} → ${orderDetails.data.status}`);
        }
        
        // Update AWB if assigned
        if (orderDetails.data.awb_code && orderDetails.data.awb_code !== orderData.shiprocketAWB) {
          updateData.shiprocketAWB = orderDetails.data.awb_code;
          updateData.awbCode = orderDetails.data.awb_code;
          hasUpdates = true;
          console.log(`📦 AWB assigned: ${orderDetails.data.awb_code}`);
        }
        
        // Update courier name if changed
        if (orderDetails.data.courier_name && orderDetails.data.courier_name !== orderData.courierName) {
          updateData.courierName = orderDetails.data.courier_name;
          hasUpdates = true;
        }
        
        // Update tracking URL if changed
        if (orderDetails.data.tracking_url && orderDetails.data.tracking_url !== orderData.trackingUrl) {
          updateData.trackingUrl = orderDetails.data.tracking_url;
          hasUpdates = true;
        }
        
        // Update shipment status if changed
        if (orderDetails.data.shipment_status && orderDetails.data.shipment_status !== orderData.shipmentStatus) {
          updateData.shipmentStatus = orderDetails.data.shipment_status;
          hasUpdates = true;
        }
        
        if (hasUpdates) {
          await adminDb.collection('orders').doc(orderDoc.id).update(updateData);
          console.log(`✅ Updated order ${orderId} from webhook`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error handling order updated webhook:', error);
      throw error;
    }
  }

  // Handle AWB assigned event
  async handleAWBAssigned(data) {
    try {
      console.log('📦 Processing AWB assigned webhook:', data);
      
      const { order_id, awb_code, courier_name } = data;
      
      if (!order_id || !awb_code) {
        throw new Error('Missing order_id or awb_code in webhook data');
      }
      
      // Find the order in Firestore
      const orderQuery = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', order_id)
        .get();
      
      if (orderQuery.empty) {
        console.log(`📦 Order ${order_id} not found in Firestore`);
        return;
      }
      
      const orderDoc = orderQuery.docs[0];
      
      // Update order with AWB information
      const updateData = {
        shiprocketAWB: awb_code,
        awbCode: awb_code,
        courierName: courier_name || null,
        shiprocketStatus: 'AWB_ASSIGNED',
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      };
      
      await adminDb.collection('orders').doc(orderDoc.id).update(updateData);
      console.log(`✅ AWB assigned to order ${order_id}: ${awb_code} via ${courier_name}`);
      
    } catch (error) {
      console.error('❌ Error handling AWB assigned webhook:', error);
      throw error;
    }
  }

  // Handle shipment dispatched event
  async handleShipmentDispatched(data) {
    try {
      console.log('🚚 Processing shipment dispatched webhook:', data);
      
      const { order_id, awb_code, courier_name } = data;
      
      if (!order_id) {
        throw new Error('Missing order_id in webhook data');
      }
      
      // Find the order in Firestore
      const orderQuery = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', order_id)
        .get();
      
      if (orderQuery.empty) {
        console.log(`📦 Order ${order_id} not found in Firestore`);
        return;
      }
      
      const orderDoc = orderQuery.docs[0];
      
      // Update order status
      const updateData = {
        shiprocketStatus: 'DISPATCHED',
        courierName: courier_name || null,
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      };
      
      if (awb_code) {
        updateData.shiprocketAWB = awb_code;
        updateData.awbCode = awb_code;
      }
      
      await adminDb.collection('orders').doc(orderDoc.id).update(updateData);
      console.log(`✅ Order ${order_id} marked as dispatched`);
      
    } catch (error) {
      console.error('❌ Error handling shipment dispatched webhook:', error);
      throw error;
    }
  }

  // Handle shipment delivered event
  async handleShipmentDelivered(data) {
    try {
      console.log('✅ Processing shipment delivered webhook:', data);
      
      const { order_id, awb_code } = data;
      
      if (!order_id) {
        throw new Error('Missing order_id in webhook data');
      }
      
      // Find the order in Firestore
      const orderQuery = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', order_id)
        .get();
      
      if (orderQuery.empty) {
        console.log(`📦 Order ${order_id} not found in Firestore`);
        return;
      }
      
      const orderDoc = orderQuery.docs[0];
      
      // Update order status
      const updateData = {
        shiprocketStatus: 'DELIVERED',
        shipmentStatus: 'DELIVERED',
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      };
      
      await adminDb.collection('orders').doc(orderDoc.id).update(updateData);
      console.log(`✅ Order ${order_id} marked as delivered`);
      
    } catch (error) {
      console.error('❌ Error handling shipment delivered webhook:', error);
      throw error;
    }
  }

  // Handle shipment failed event
  async handleShipmentFailed(data) {
    try {
      console.log('❌ Processing shipment failed webhook:', data);
      
      const { order_id, reason } = data;
      
      if (!order_id) {
        throw new Error('Missing order_id in webhook data');
      }
      
      // Find the order in Firestore
      const orderQuery = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', order_id)
        .get();
      
      if (orderQuery.empty) {
        console.log(`📦 Order ${order_id} not found in Firestore`);
        return;
      }
      
      const orderDoc = orderQuery.docs[0];
      
      // Update order status
      const updateData = {
        shiprocketStatus: 'FAILED',
        shipmentStatus: 'FAILED',
        failureReason: reason || 'Shipment failed',
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      };
      
      await adminDb.collection('orders').doc(orderDoc.id).update(updateData);
      console.log(`❌ Order ${order_id} marked as failed: ${reason}`);
      
    } catch (error) {
      console.error('❌ Error handling shipment failed webhook:', error);
      throw error;
    }
  }

  // Handle tracking updated event
  async handleTrackingUpdated(data) {
    try {
      console.log('📍 Processing tracking updated webhook:', data);
      
      const { order_id, awb_code, tracking_url, status } = data;
      
      if (!order_id) {
        throw new Error('Missing order_id in webhook data');
      }
      
      // Find the order in Firestore
      const orderQuery = await adminDb.collection('orders')
        .where('shiprocketOrderId', '==', order_id)
        .get();
      
      if (orderQuery.empty) {
        console.log(`📦 Order ${order_id} not found in Firestore`);
        return;
      }
      
      const orderDoc = orderQuery.docs[0];
      
      // Update tracking information
      const updateData = {
        shiprocketLastUpdated: new Date(),
        updatedAt: new Date()
      };
      
      if (tracking_url) {
        updateData.trackingUrl = tracking_url;
      }
      
      if (status) {
        updateData.shipmentStatus = status;
      }
      
      if (awb_code) {
        updateData.shiprocketAWB = awb_code;
        updateData.awbCode = awb_code;
      }
      
      await adminDb.collection('orders').doc(orderDoc.id).update(updateData);
      console.log(`📍 Updated tracking for order ${order_id}`);
      
    } catch (error) {
      console.error('❌ Error handling tracking updated webhook:', error);
      throw error;
    }
  }

  // Test webhook processing
  async testWebhook(payload) {
    try {
      console.log('🧪 Testing webhook processing...');
      const result = await this.processWebhook(payload);
      console.log('✅ Webhook test successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Webhook test failed:', error);
      throw error;
    }
  }
}

module.exports = new WebhookService();
