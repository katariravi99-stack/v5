# Automatic Shiprocket to UI Synchronization Setup

## Overview

The system now provides **complete automatic synchronization** from Shiprocket to your UI without any manual intervention. Everything happens automatically in the background.

## 🚀 What's Automatic Now

### 1. **Automatic Background Sync**
- ✅ Runs every 5 minutes automatically
- ✅ Syncs all orders with AWB and status updates
- ✅ Auto-assigns AWB to orders without AWB
- ✅ Updates order statuses in real-time
- ✅ Syncs new orders from Shiprocket

### 2. **Real-time Webhook Updates**
- ✅ Receives instant updates from Shiprocket
- ✅ Processes order creation, updates, AWB assignment
- ✅ Handles shipment dispatch, delivery, and failures
- ✅ Updates tracking information automatically

### 3. **Automatic AWB Assignment**
- ✅ New orders automatically get AWB assigned
- ✅ Intelligent courier selection based on delivery pincode
- ✅ Fallback mechanisms for failed assignments

### 4. **Comprehensive Status Updates**
- ✅ Order status updates automatically
- ✅ AWB codes fetched and stored
- ✅ Courier information captured
- ✅ Tracking URLs updated

## 🔧 Setup Instructions

### 1. **Environment Configuration**
Add these to your `.env` file:

```env
# Shiprocket Configuration
SHIPROCKET_EMAIL=your-email@example.com
SHIPROCKET_PASSWORD=your-password
SHIPROCKET_PICKUP_PINCODE=110001
SHIPROCKET_PICKUP_LOCATION=warehouse-1

# Optional: Webhook secret for security
SHIPROCKET_WEBHOOK_SECRET=your-webhook-secret
```

### 2. **Start the Server**
```bash
npm start
```

The automatic sync will start automatically after 10 seconds.

### 3. **Configure Shiprocket Webhooks (Optional but Recommended)**
In your Shiprocket dashboard:
1. Go to Settings > Webhooks
2. Add webhook URL: `https://your-domain.com/api/shiprocket/webhook`
3. Select events to receive:
   - Order Created
   - Order Updated
   - AWB Assigned
   - Shipment Dispatched
   - Shipment Delivered
   - Shipment Failed
   - Tracking Updated

## 📊 How It Works

### Automatic Background Sync (Every 5 Minutes)
```
🔄 Auto-sync Process:
1. Sync existing orders with AWB and status
2. Auto-assign AWB to orders without AWB
3. Update order statuses from Shiprocket
4. Sync new orders from Shiprocket
5. Update Firestore with latest information
```

### Real-time Webhook Updates
```
🔔 Webhook Events:
- order.created → Creates new order in Firestore
- order.updated → Updates existing order
- awb.assigned → Assigns AWB to order
- shipment.dispatched → Updates status to DISPATCHED
- shipment.delivered → Updates status to DELIVERED
- shipment.failed → Updates status to FAILED
- tracking.updated → Updates tracking information
```

## 🎛️ Management Endpoints

### Start/Stop Auto-Sync
```bash
# Start auto-sync (default: every 5 minutes)
curl -X POST http://localhost:5000/api/shiprocket/auto-sync/start

# Start with custom frequency (every 2 minutes)
curl -X POST http://localhost:5000/api/shiprocket/auto-sync/start \
  -H "Content-Type: application/json" \
  -d '{"frequency": 2}'

# Stop auto-sync
curl -X POST http://localhost:5000/api/shiprocket/auto-sync/stop

# Check sync status
curl http://localhost:5000/api/shiprocket/auto-sync/status

# Trigger manual sync
curl -X POST http://localhost:5000/api/shiprocket/auto-sync/trigger

# Change sync frequency
curl -X POST http://localhost:5000/api/shiprocket/auto-sync/frequency \
  -H "Content-Type: application/json" \
  -d '{"frequency": 3}'
```

### Webhook Management
```bash
# Test webhook processing
curl -X POST http://localhost:5000/api/shiprocket/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "event": "order.updated",
      "data": {
        "order_id": "12345",
        "status": "DISPATCHED",
        "awb_code": "AWB123456"
      }
    }
  }'
```

## 📱 UI Integration

### Fetch Orders with AWB Information
```javascript
// Get all orders (will include AWB and status automatically)
const response = await fetch('/api/orders');
const orders = await response.json();

// Each order will have:
// - shiprocketAWB: AWB code
// - awbCode: AWB code (duplicate for compatibility)
// - shiprocketStatus: Current status
// - courierName: Courier name
// - trackingUrl: Tracking URL
// - shipmentStatus: Shipment status
```

### Real-time Updates
The UI will automatically receive updated information because:
1. **Background sync** updates Firestore every 5 minutes
2. **Webhooks** provide instant updates when events occur
3. **Your UI** can poll the orders endpoint to get latest data

## 🔍 Monitoring

### Check Sync Status
```bash
curl http://localhost:5000/api/shiprocket/auto-sync/status
```

Response:
```json
{
  "success": true,
  "status": {
    "isRunning": true,
    "lastSyncTime": "2024-01-15T10:30:00.000Z",
    "syncFrequency": 300000,
    "nextSyncIn": 120000
  }
}
```

### Server Logs
Watch for these log messages:
```
🔄 Automatic Shiprocket sync started (every 5 minutes)
🔄 Starting automatic Shiprocket synchronization...
✅ Auto-sync completed in 2500ms: {ordersCreated: 0, ordersUpdated: 3, awbAssigned: 1, errors: 0}
🔔 Processing Shiprocket webhook: {"event": "awb.assigned", "data": {...}}
✅ AWB assigned to order 12345: AWB123456 via Blue Dart
```

## 🚨 Troubleshooting

### Auto-Sync Not Working
1. Check if auto-sync is running:
   ```bash
   curl http://localhost:5000/api/shiprocket/auto-sync/status
   ```

2. Check Shiprocket connection:
   ```bash
   curl http://localhost:5000/api/shiprocket/test
   ```

3. Trigger manual sync to test:
   ```bash
   curl -X POST http://localhost:5000/api/shiprocket/auto-sync/trigger
   ```

### Webhooks Not Working
1. Check webhook URL is accessible from internet
2. Verify webhook events are enabled in Shiprocket
3. Test webhook processing:
   ```bash
   curl -X POST http://localhost:5000/api/shiprocket/webhook/test
   ```

### Missing AWB Codes
1. Check if orders have delivery pincode
2. Verify courier serviceability:
   ```bash
   curl "http://localhost:5000/api/shiprocket/couriers?pincode=110001&weight=0.5"
   ```

3. Manually assign AWB:
   ```bash
   curl -X POST http://localhost:5000/api/shiprocket/auto-assign-awb \
     -H "Content-Type: application/json" \
     -d '{"shiprocketOrderId": "12345", "deliveryPincode": "110001"}'
   ```

## 🎯 Expected Results

After setup, you should see:

### Automatic Updates
- ✅ Orders created in Shiprocket appear in UI automatically
- ✅ AWB codes assigned automatically
- ✅ Order status updates automatically
- ✅ Tracking information updated automatically
- ✅ Courier information captured automatically

### Real-time Updates
- ✅ Instant updates when orders are created
- ✅ Instant AWB assignment notifications
- ✅ Real-time status changes
- ✅ Immediate tracking updates

### No Manual Intervention Required
- ✅ Everything happens automatically
- ✅ Background processes handle all sync
- ✅ Webhooks provide instant updates
- ✅ UI always shows latest information

## 🔧 Customization

### Change Sync Frequency
```javascript
// Change to every 2 minutes
await fetch('/api/shiprocket/auto-sync/frequency', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ frequency: 2 })
});
```

### Add Custom Webhook Events
Modify `src/services/webhookService.js` to handle additional events.

### Custom AWB Assignment Logic
Modify `src/services/autoSyncService.js` to change courier selection logic.

## 📞 Support

If you encounter issues:
1. Check server logs for detailed error messages
2. Verify Shiprocket credentials and account status
3. Test individual API endpoints
4. Check webhook URL accessibility
5. Verify pickup location configuration

The system is designed to be completely automatic - once set up, it will handle everything without manual intervention!
