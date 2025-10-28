const express = require('express');
const router = express.Router();
const shiprocketService = require('../services/shiprocketService');

// Create order in Shiprocket
router.post('/orders/create', async (req, res) => {
  try {
    console.log('📦 Creating Shiprocket order:', req.body);
    
    const result = await shiprocketService.createOrder(req.body);
    
    res.json({
      success: true,
      message: 'Order created successfully in Shiprocket',
      data: result
    });
  } catch (error) {
    console.error('❌ Error creating Shiprocket order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order in Shiprocket',
      error: error.message
    });
  }
});

// Assign AWB to order
router.post('/assign-awb', async (req, res) => {
  try {
    const { shiprocketOrderId, courierId } = req.body;
    
    if (!shiprocketOrderId || !courierId) {
      return res.status(400).json({
        success: false,
        message: 'shiprocketOrderId and courierId are required'
      });
    }
    
    console.log('📦 Assigning AWB to order:', shiprocketOrderId);
    
    const result = await shiprocketService.assignAWB(shiprocketOrderId, courierId);
    
    res.json({
      success: true,
      message: 'AWB assigned successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error assigning AWB:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign AWB',
      error: error.message
    });
  }
});

// Generate shipping label
router.post('/generate-label', async (req, res) => {
  try {
    const { shipmentId } = req.body;
    
    if (!shipmentId) {
      return res.status(400).json({
        success: false,
        message: 'shipmentId is required'
      });
    }
    
    console.log('🏷️ Generating shipping label for:', shipmentId);
    
    const result = await shiprocketService.generateLabel(shipmentId);
    
    res.json({
      success: true,
      message: 'Shipping label generated successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error generating shipping label:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate shipping label',
      error: error.message
    });
  }
});

// Track shipment
router.get('/track/:awbCode', async (req, res) => {
  try {
    const { awbCode } = req.params;
    
    if (!awbCode) {
      return res.status(400).json({
        success: false,
        message: 'AWB code is required'
      });
    }
    
    console.log('📍 Tracking shipment:', awbCode);
    
    const result = await shiprocketService.trackShipment(awbCode);
    
    res.json({
      success: true,
      message: 'Shipment tracking successful',
      data: result
    });
  } catch (error) {
    console.error('❌ Error tracking shipment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track shipment',
      error: error.message
    });
  }
});

// Get available couriers
router.get('/couriers', async (req, res) => {
  try {
    const { pincode, weight } = req.query;
    
    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: 'Pincode is required'
      });
    }
    
    console.log('🚚 Getting available couriers for pincode:', pincode);
    
    const result = await shiprocketService.getCouriers(pincode, weight);
    
    res.json({
      success: true,
      message: 'Available couriers fetched successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting couriers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available couriers',
      error: error.message
    });
  }
});

// Get shipment details by Shiprocket order ID
router.get('/shipment/:shiprocketOrderId', async (req, res) => {
  try {
    const { shiprocketOrderId } = req.params;
    
    if (!shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Shiprocket order ID is required'
      });
    }
    
    console.log('📋 Getting shipment details for order:', shiprocketOrderId);
    
    const result = await shiprocketService.getShipmentDetails(shiprocketOrderId);
    
    res.json({
      success: true,
      message: 'Shipment details retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting shipment details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get shipment details',
      error: error.message
    });
  }
});

// Get all orders from Shiprocket
router.get('/orders', async (req, res) => {
  try {
    console.log('📦 Getting all orders from Shiprocket...');
    
    const result = await shiprocketService.getAllOrders();
    
    res.json({
      success: true,
      message: 'Orders fetched successfully from Shiprocket',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting orders from Shiprocket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders from Shiprocket',
      error: error.message
    });
  }
});

// Get all orders with pagination (all pages)
router.get('/orders/all', async (req, res) => {
  try {
    console.log('📦 Getting ALL orders from Shiprocket (all pages)...');
    
    const result = await shiprocketService.getAllOrdersPaginated();
    
    res.json({
      success: true,
      message: `All orders fetched successfully from Shiprocket (${result.totalCount} total)`,
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting all orders from Shiprocket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get all orders from Shiprocket',
      error: error.message
    });
  }
});

// Get orders with filters
router.get('/orders/filtered', async (req, res) => {
  try {
    const filters = req.query;
    console.log('🔍 Getting filtered orders from Shiprocket:', filters);
    
    const result = await shiprocketService.getOrdersWithFilters(filters);
    
    res.json({
      success: true,
      message: 'Filtered orders fetched successfully from Shiprocket',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting filtered orders from Shiprocket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get filtered orders from Shiprocket',
      error: error.message
    });
  }
});

// Get detailed order status
router.get('/order-status/:shiprocketOrderId', async (req, res) => {
  try {
    const { shiprocketOrderId } = req.params;
    
    if (!shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Shiprocket order ID is required'
      });
    }
    
    console.log('🔍 Getting detailed order status for:', shiprocketOrderId);
    
    const result = await shiprocketService.getOrderStatus(shiprocketOrderId);
    
    res.json({
      success: true,
      message: 'Order status retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order status',
      error: error.message
    });
  }
});

// Cancel order
router.post('/cancel-order', async (req, res) => {
  try {
    const { shiprocketOrderId, reason } = req.body;
    
    if (!shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Shiprocket order ID is required'
      });
    }
    
    console.log('❌ Canceling order:', shiprocketOrderId);
    
    const result = await shiprocketService.cancelOrder(shiprocketOrderId, reason);
    
    res.json({
      success: true,
      message: 'Order canceled successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error canceling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message
    });
  }
});

// Auto-assign AWB to order
router.post('/auto-assign-awb', async (req, res) => {
  try {
    const { shiprocketOrderId, deliveryPincode, weight } = req.body;
    
    if (!shiprocketOrderId || !deliveryPincode) {
      return res.status(400).json({
        success: false,
        message: 'shiprocketOrderId and deliveryPincode are required'
      });
    }
    
    console.log('🚀 Auto-assigning AWB to order:', shiprocketOrderId);
    
    const result = await shiprocketService.autoAssignAWB(shiprocketOrderId, deliveryPincode, weight);
    
    res.json({
      success: true,
      message: 'AWB auto-assigned successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error auto-assigning AWB:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to auto-assign AWB',
      error: error.message
    });
  }
});

// Get order with AWB details
router.get('/order-with-awb/:shiprocketOrderId', async (req, res) => {
  try {
    const { shiprocketOrderId } = req.params;
    
    if (!shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Shiprocket order ID is required'
      });
    }
    
    console.log('📋 Getting order with AWB details for:', shiprocketOrderId);
    
    const result = await shiprocketService.getOrderWithAWB(shiprocketOrderId);
    
    res.json({
      success: true,
      message: 'Order with AWB details retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting order with AWB:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order with AWB details',
      error: error.message
    });
  }
});

// Batch update orders with AWB
router.post('/batch-update-awb', async (req, res) => {
  try {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orderIds array is required'
      });
    }
    
    console.log('🔄 Batch updating orders with AWB:', orderIds);
    
    const result = await shiprocketService.batchUpdateOrdersWithAWB(orderIds);
    
    res.json({
      success: true,
      message: `Batch update completed: ${result.successCount}/${result.totalCount} successful`,
      data: result
    });
  } catch (error) {
    console.error('❌ Error batch updating orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to batch update orders',
      error: error.message
    });
  }
});

// Get AWB details for a specific Shiprocket order
router.get('/orders/:shiprocketOrderId/awb', async (req, res) => {
  try {
    const { shiprocketOrderId } = req.params;
    
    if (!shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Shiprocket order ID is required'
      });
    }
    
    console.log('📦 Getting AWB details for order:', shiprocketOrderId);
    
    const result = await shiprocketService.getOrderWithAWB(shiprocketOrderId);
    
    res.json({
      success: true,
      message: 'AWB details retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting AWB details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AWB details',
      error: error.message
    });
  }
});

// Create real order in Shiprocket (for frontend sync button)
router.post('/create-real-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    console.log('🚀 Creating real order in Shiprocket for:', orderId);
    
    // This would need to fetch the order from Firestore and create it in Shiprocket
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'Real order creation endpoint - implementation needed',
      data: { orderId }
    });
  } catch (error) {
    console.error('❌ Error creating real order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create real order',
      error: error.message
    });
  }
});

// Test Shiprocket connection
router.get('/test', async (req, res) => {
  try {
    console.log('🔍 Testing Shiprocket connection...');
    
    // Try to authenticate
    const token = await shiprocketService.authenticate();
    
    if (token) {
      res.json({
        success: true,
        message: 'Shiprocket connection successful',
        authenticated: true,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Authentication failed');
    }
  } catch (error) {
    console.error('❌ Shiprocket connection test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Shiprocket connection failed',
      error: error.message,
      authenticated: false,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
