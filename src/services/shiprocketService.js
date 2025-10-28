const axios = require('axios');
require('dotenv').config();

class ShiprocketService {
  constructor() {
    this.baseURL = 'https://apiv2.shiprocket.in/v1/external';
    this.email = process.env.SHIPROCKET_EMAIL;
    this.password = process.env.SHIPROCKET_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
  }

  // Authenticate with Shiprocket API
  async authenticate() {
    try {
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token; // Token is still valid
      }

      const response = await axios.post(`${this.baseURL}/auth/login`, {
        email: this.email,
        password: this.password
      });

      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Token is valid for 240 hours (10 days)
        this.tokenExpiry = new Date(Date.now() + (240 * 60 * 60 * 1000));
        console.log('✅ Shiprocket authentication successful');
        return this.token;
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Shiprocket authentication failed:', error.response?.data || error.message);
      throw new Error(`Shiprocket authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get authenticated headers
  async getAuthHeaders() {
    const token = await this.authenticate();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // Create order in Shiprocket
  async createOrder(orderData) {
    try {
      console.log('🚀 Creating order in Shiprocket:', orderData.orderId);
      
      const headers = await this.getAuthHeaders();
      
      // Transform order data to Shiprocket format
      const shiprocketOrder = this.transformOrderData(orderData);
      
      const response = await axios.post(
        `${this.baseURL}/orders/create/adhoc`,
        shiprocketOrder,
        { headers }
      );

      console.log('🔍 Shiprocket API Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data && (response.data.order_id || response.data.channel_order_id)) {
        const orderId = response.data.order_id || response.data.channel_order_id;
        console.log('✅ Order created in Shiprocket successfully:', orderId);
        return {
          success: true,
          shiprocketOrderId: orderId,
          data: response.data
        };
      } else {
        console.log('❌ Invalid response structure:', response.data);
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to create order in Shiprocket:', error.response?.data || error.message);
      throw new Error(`Shiprocket order creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Transform order data to Shiprocket format
  transformOrderData(orderData) {
    console.log('🔍 Transforming order data:', JSON.stringify(orderData, null, 2));
    
    // Handle both data structures - new format (individual fields) and old format (customerInfo object)
    let customerName, customerEmail, customerPhone;
    let billingAddress, billingCity, billingPincode, billingState, billingCountry;
    
    if (orderData.customerInfo && orderData.customerInfo.address) {
      // Old format: customerInfo.address structure
      const customerInfo = orderData.customerInfo;
      const address = customerInfo.address;
      
      customerName = customerInfo.name;
      customerEmail = customerInfo.email;
      customerPhone = customerInfo.phone;
      billingAddress = address.street;
      billingCity = address.city;
      billingPincode = address.pincode;
      billingState = address.state;
      billingCountry = address.country || "India";
    } else {
      // New format: individual fields
      customerName = orderData.billingCustomerName || orderData.customerName;
      customerEmail = orderData.billingEmail || orderData.customerEmail;
      customerPhone = orderData.billingPhone || orderData.customerPhone;
      billingAddress = orderData.billingAddress;
      billingCity = orderData.billingCity;
      billingPincode = orderData.billingPincode;
      billingState = orderData.billingState;
      billingCountry = orderData.billingCountry || "India";
    }
    
    // Calculate total weight (assuming average weight per item)
    const totalWeight = (orderData.cartItems || orderData.orderItems || []).reduce((total, item) => {
      return total + (item.weight || 0.49); // Default 0.5kg per item if weight not specified
    }, 0);

    // Calculate total value
    const totalValue = (orderData.cartItems || orderData.orderItems || []).reduce((total, item) => {
      return total + ((item.price || item.sellingPrice) * item.quantity);
    }, 0);

    const transformedData = {
      order_id: orderData.orderId,
      order_date: new Date().toISOString().split('T')[0],
      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "warehouse-1", // Use configured pickup location
      billing_customer_name: customerName,
      billing_last_name: (customerName || '').split(' ').slice(1).join(' ') || '',
      billing_address: billingAddress,
      billing_address_2: "",
      billing_city: billingCity,
      billing_pincode: billingPincode,
      billing_state: billingState,
      billing_country: billingCountry,
      billing_email: customerEmail,
      billing_phone: customerPhone,
      billing_alternate_phone: "",
      shipping_is_billing: true,
      shipping_customer_name: customerName,
      shipping_last_name: (customerName || '').split(' ').slice(1).join(' ') || '',
      shipping_address: billingAddress,
      shipping_address_2: "",
      shipping_city: billingCity,
      shipping_pincode: billingPincode,
      shipping_state: billingState,
      shipping_country: billingCountry,
      shipping_email: customerEmail,
      shipping_phone: customerPhone,
      order_items: (orderData.cartItems || orderData.orderItems || []).map(item => ({
        name: item.name,
        sku: item.id || item.sku || item.name,
        units: item.quantity || item.units,
        selling_price: item.price || item.sellingPrice,
        discount: 0,
        tax: 0,
        hsn: 6204, // HSN code for silk sarees
        product_category: "Silk Sarees"
      })),
      payment_method: (orderData.paymentMethod === 'COD' || orderData.paymentMethod === 'cod') ? "COD" : "Prepaid",
      sub_total: orderData.subTotal || totalValue,
      length: orderData.length || 30, // Default dimensions in cm
      breadth: orderData.breadth || 20,
      height: orderData.height || 5,
      weight: Math.max(orderData.weight || totalWeight, 0.1), // Minimum 0.1kg
      order_notes: orderData.orderNotes || "Silk saree order from Varaha Silks"
    };
    
    // Validate required fields
    const requiredFields = ['billing_customer_name', 'billing_address', 'billing_city', 'billing_pincode', 'billing_state', 'billing_email', 'billing_phone'];
    const missingFields = requiredFields.filter(field => !transformedData[field]);
    
    if (missingFields.length > 0) {
      console.error('❌ Missing required fields for Shiprocket:', missingFields);
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    console.log('✅ Transformed data for Shiprocket:', JSON.stringify(transformedData, null, 2));
    return transformedData;
  }

  // Assign AWB (Air Waybill) to order
  async assignAWB(shiprocketOrderId, courierId) {
    try {
      console.log('📦 Assigning AWB to order:', shiprocketOrderId);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.post(
        `${this.baseURL}/courier/assign/awb`,
        {
          shipment_id: shiprocketOrderId,
          courier_id: courierId
        },
        { headers }
      );

      if (response.data && response.data.awb_code) {
        console.log('✅ AWB assigned successfully:', response.data.awb_code);
        return {
          success: true,
          awbCode: response.data.awb_code,
          data: response.data
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to assign AWB:', error.response?.data || error.message);
      throw new Error(`AWB assignment failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Generate shipping label
  async generateLabel(shipmentId) {
    try {
      console.log('🏷️ Generating shipping label for:', shipmentId);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.post(
        `${this.baseURL}/courier/generate/label`,
        {
          shipment_id: shipmentId
        },
        { headers }
      );

      if (response.data && response.data.label_url) {
        console.log('✅ Shipping label generated successfully');
        return {
          success: true,
          labelUrl: response.data.label_url,
          data: response.data
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to generate shipping label:', error.response?.data || error.message);
      throw new Error(`Label generation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Track shipment
  async trackShipment(awbCode) {
    try {
      console.log('📍 Tracking shipment:', awbCode);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/track/awb/${awbCode}`,
        { headers }
      );

      if (response.data) {
        console.log('✅ Shipment tracking successful');
        return {
          success: true,
          trackingData: response.data,
          data: response.data
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to track shipment:', error.response?.data || error.message);
      throw new Error(`Shipment tracking failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get shipment details (more comprehensive than tracking)
  async getShipmentDetails(shiprocketOrderId) {
    try {
      console.log('📋 Getting shipment details for order:', shiprocketOrderId);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/orders/show/${shiprocketOrderId}`,
        { headers }
      );

      if (response.data && response.data.data) {
        const orderData = response.data.data;
        console.log('✅ Shipment details retrieved successfully');
        
        // Extract AWB data from shipments (can be array or single object)
        let awbCode = null;
        let courierName = null;
        let trackingUrl = null;
        
        if (orderData.shipments) {
          if (Array.isArray(orderData.shipments)) {
            // Handle shipments as array
            const shipmentWithAWB = orderData.shipments.find(shipment => shipment.awb);
            if (shipmentWithAWB) {
              awbCode = shipmentWithAWB.awb;
              courierName = shipmentWithAWB.courier;
              trackingUrl = shipmentWithAWB.tracking_url;
              console.log(`📦 Found AWB in shipments array: ${awbCode}`);
            }
          } else if (orderData.shipments.awb) {
            // Handle shipments as single object
            awbCode = orderData.shipments.awb;
            courierName = orderData.shipments.courier;
            trackingUrl = orderData.shipments.tracking_url;
            console.log(`📦 Found AWB in shipments object: ${awbCode}`);
          }
        }
        
        // Fallback to order-level AWB fields if no shipments data
        if (!awbCode) {
          awbCode = orderData.awb_code || orderData.last_mile_awb;
          courierName = orderData.courier_name || orderData.last_mile_courier_name;
          trackingUrl = orderData.tracking_url || orderData.last_mile_awb_track_url;
        }
        
        // Create enhanced shipment data
        const enhancedShipmentData = {
          ...orderData,
          awb_code: awbCode,
          awbCode: awbCode,
          courier_name: courierName,
          courierName: courierName,
          tracking_url: trackingUrl,
          trackingUrl: trackingUrl
        };
        
        return {
          success: true,
          shipmentData: enhancedShipmentData,
          data: enhancedShipmentData
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to get shipment details:', error.response?.data || error.message);
      throw new Error(`Shipment details retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get all orders from Shiprocket
  async getAllOrders(options = {}) {
    try {
      console.log('📦 Getting all orders from Shiprocket...');
      
      const headers = await this.getAuthHeaders();
      
      // Default parameters
      const params = {
        page: options.page || 1,
        per_page: options.per_page || 100, // Get more orders per page
        ...options
      };
      
      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });
      
      console.log('🔍 Fetching orders with params:', params);
      
      const response = await axios.get(
        `${this.baseURL}/orders`,
        { 
          headers,
          params
        }
      );

      if (response.data && response.data.data) {
        console.log('✅ Orders fetched successfully from Shiprocket');
        console.log(`📊 Found ${response.data.data.length} orders on page ${params.page}`);
        return {
          success: true,
          hasOrders: response.data.data && response.data.data.length > 0,
          isArray: Array.isArray(response.data.data),
          ordersLength: response.data.data ? response.data.data.length : 0,
          orders: response.data.data,
          data: response.data,
          pagination: response.data.meta?.pagination || null
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to get orders from Shiprocket:', error.response?.data || error.message);
      throw new Error(`Failed to get orders: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get orders with specific filters
  async getOrdersWithFilters(filters = {}) {
    try {
      console.log('🔍 Getting orders with filters:', filters);
      
      const headers = await this.getAuthHeaders();
      
      // Build query parameters
      const params = {
        page: filters.page || 1,
        per_page: filters.per_page || 100,
        ...filters
      };
      
      // Remove undefined values
      Object.keys(params).forEach(key => {
        if (params[key] === undefined || params[key] === null || params[key] === '') {
          delete params[key];
        }
      });
      
      console.log('📋 Final params:', params);
      
      const response = await axios.get(
        `${this.baseURL}/orders`,
        { 
          headers,
          params
        }
      );

      if (response.data && response.data.data) {
        console.log('✅ Filtered orders fetched successfully');
        console.log(`📊 Found ${response.data.data.length} orders`);
        return {
          success: true,
          orders: response.data.data,
          data: response.data,
          pagination: response.data.meta?.pagination || null
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to get filtered orders:', error.response?.data || error.message);
      throw new Error(`Failed to get filtered orders: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get all orders across all pages
  async getAllOrdersPaginated() {
    try {
      console.log('📦 Getting ALL orders from Shiprocket (paginated)...');
      
      let allOrders = [];
      let currentPage = 1;
      let hasMorePages = true;
      const perPage = 100; // Maximum per page
      
      while (hasMorePages) {
        console.log(`📄 Fetching page ${currentPage}...`);
        
        const result = await this.getAllOrders({
          page: currentPage,
          per_page: perPage
        });
        
        if (result.success && result.orders) {
          allOrders = allOrders.concat(result.orders);
          console.log(`✅ Page ${currentPage}: ${result.orders.length} orders`);
          
          // Check if there are more pages
          if (result.pagination) {
            hasMorePages = currentPage < result.pagination.total_pages;
            currentPage++;
          } else {
            // If no pagination info, check if we got less than perPage (last page)
            hasMorePages = result.orders.length === perPage;
            currentPage++;
          }
        } else {
          hasMorePages = false;
        }
        
        // Safety check to prevent infinite loop
        if (currentPage > 50) {
          console.log('⚠️ Reached maximum page limit (50), stopping pagination');
          break;
        }
      }
      
      console.log(`🎉 Total orders fetched: ${allOrders.length}`);
      
      return {
        success: true,
        orders: allOrders,
        totalCount: allOrders.length,
        pagesFetched: currentPage - 1
      };
    } catch (error) {
      console.error('❌ Failed to get all paginated orders:', error.message);
      throw new Error(`Failed to get all orders: ${error.message}`);
    }
  }

  // Check order status and get detailed information
  async getOrderStatus(shiprocketOrderId) {
    try {
      console.log('🔍 Getting detailed order status for:', shiprocketOrderId);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/orders/show/${shiprocketOrderId}`,
        { headers }
      );

      if (response.data && response.data.data) {
        console.log('✅ Order status retrieved successfully');
        return {
          success: true,
          orderDetails: response.data.data,
          data: response.data.data
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to get order status:', error.response?.data || error.message);
      throw new Error(`Order status retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Cancel an order in Shiprocket
  async cancelOrder(shiprocketOrderId, reason = "Order cancelled by merchant") {
    try {
      console.log('❌ Canceling order in Shiprocket:', shiprocketOrderId);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.post(
        `${this.baseURL}/orders/cancel/shipment/awbs`,
        {
          awbs: [shiprocketOrderId],
          reason: reason
        },
        { headers }
      );

      if (response.data) {
        console.log('✅ Order canceled successfully');
        return {
          success: true,
          data: response.data
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to cancel order:', error.response?.data || error.message);
      throw new Error(`Order cancellation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get available couriers
  async getCouriers(pincode, weight) {
    try {
      console.log('🚚 Getting available couriers for pincode:', pincode);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/serviceability/`,
        {
          headers,
          params: {
            pickup_pincode: process.env.SHIPROCKET_PICKUP_PINCODE || "110001", // Your pickup pincode
            delivery_pincode: pincode,
            weight: weight || 0.49,
            cod: 0 // Cash on delivery amount
          }
        }
      );

      if (response.data && response.data.data) {
        console.log('✅ Available couriers fetched successfully');
        return {
          success: true,
          couriers: response.data.data,
          data: response.data
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to get couriers:', error.response?.data || error.message);
      throw new Error(`Courier serviceability check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Auto-assign AWB to order (with automatic courier selection)
  async autoAssignAWB(shiprocketOrderId, deliveryPincode, weight = 0.49) {
    try {
      console.log('🚀 Auto-assigning AWB to order:', shiprocketOrderId);
      
      // First, get available couriers for the delivery pincode
      const couriersResult = await this.getCouriers(deliveryPincode, weight);
      
      if (!couriersResult.success || !couriersResult.couriers || couriersResult.couriers.length === 0) {
        throw new Error('No couriers available for the delivery pincode');
      }
      
      // Select the first available courier (you can modify this logic)
      const selectedCourier = couriersResult.couriers[0];
      const courierId = selectedCourier.courier_id;
      
      console.log('📦 Selected courier:', selectedCourier.courier_name, 'ID:', courierId);
      
      // Assign AWB using the selected courier
      const awbResult = await this.assignAWB(shiprocketOrderId, courierId);
      
      if (awbResult.success) {
        console.log('✅ AWB auto-assigned successfully:', awbResult.awbCode);
        return {
          success: true,
          awbCode: awbResult.awbCode,
          courierName: selectedCourier.courier_name,
          courierId: courierId,
          data: awbResult.data
        };
      } else {
        throw new Error('Failed to assign AWB');
      }
    } catch (error) {
      console.error('❌ Failed to auto-assign AWB:', error.message);
      throw new Error(`Auto AWB assignment failed: ${error.message}`);
    }
  }

  // Get comprehensive order details including AWB and status
  async getOrderWithAWB(shiprocketOrderId) {
    try {
      console.log('📋 Getting comprehensive order details for:', shiprocketOrderId);
      
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/orders/show/${shiprocketOrderId}`,
        { headers }
      );

      if (response.data && response.data.data) {
        const orderData = response.data.data;
        console.log('✅ Order details retrieved successfully');
        
        // Extract AWB data from shipments (can be array or single object)
        let awbCode = null;
        let courierName = null;
        let trackingUrl = null;
        
        if (orderData.shipments) {
          if (Array.isArray(orderData.shipments)) {
            // Handle shipments as array
            const shipmentWithAWB = orderData.shipments.find(shipment => shipment.awb);
            if (shipmentWithAWB) {
              awbCode = shipmentWithAWB.awb;
              courierName = shipmentWithAWB.courier;
              trackingUrl = shipmentWithAWB.tracking_url;
              console.log(`📦 Found AWB in shipments array: ${awbCode}`);
            }
          } else if (orderData.shipments.awb) {
            // Handle shipments as single object
            awbCode = orderData.shipments.awb;
            courierName = orderData.shipments.courier;
            trackingUrl = orderData.shipments.tracking_url;
            console.log(`📦 Found AWB in shipments object: ${awbCode}`);
          }
        }
        
        // Fallback to order-level AWB fields if no shipments data
        if (!awbCode) {
          awbCode = orderData.awb_code || orderData.last_mile_awb;
          courierName = orderData.courier_name || orderData.last_mile_courier_name;
          trackingUrl = orderData.tracking_url || orderData.last_mile_awb_track_url;
        }
        
        return {
          success: true,
          orderId: orderData.id || orderData.order_id,
          awbCode: awbCode,
          status: orderData.status || null,
          courierName: courierName,
          trackingUrl: trackingUrl,
          shipmentStatus: orderData.shipment_status || null,
          data: orderData
        };
      } else {
        throw new Error('Invalid response from Shiprocket API');
      }
    } catch (error) {
      console.error('❌ Failed to get order with AWB:', error.response?.data || error.message);
      throw new Error(`Order details retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Batch update orders with AWB and status
  async batchUpdateOrdersWithAWB(orderIds) {
    try {
      console.log('🔄 Batch updating orders with AWB and status:', orderIds);
      
      const results = [];
      
      for (const orderId of orderIds) {
        try {
          const orderDetails = await this.getOrderWithAWB(orderId);
          results.push({
            orderId: orderId,
            success: true,
            data: orderDetails
          });
        } catch (error) {
          console.error(`❌ Failed to update order ${orderId}:`, error.message);
          results.push({
            orderId: orderId,
            success: false,
            error: error.message
          });
        }
      }
      
      console.log(`✅ Batch update completed: ${results.filter(r => r.success).length}/${results.length} successful`);
      
      return {
        success: true,
        results: results,
        successCount: results.filter(r => r.success).length,
        totalCount: results.length
      };
    } catch (error) {
      console.error('❌ Failed to batch update orders:', error.message);
      throw new Error(`Batch update failed: ${error.message}`);
    }
  }
}

module.exports = new ShiprocketService();
