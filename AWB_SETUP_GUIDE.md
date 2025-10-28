# AWB (Air Waybill) Setup Guide for Shiprocket Integration

## Issues Fixed

### 1. **Missing Environment Configuration**
- Created `.env` template with required Shiprocket credentials
- Added proper environment variable handling

### 2. **Enhanced AWB Assignment Process**
- Added automatic AWB assignment after order creation
- Implemented intelligent courier selection
- Added fallback mechanisms for failed AWB assignments

### 3. **Comprehensive Status Updates**
- Added batch update functionality for all orders
- Implemented real-time AWB and status fetching
- Added comprehensive order details retrieval

### 4. **New API Endpoints**

#### Auto-Assign AWB
```
POST /api/shiprocket/auto-assign-awb
Body: {
  "shiprocketOrderId": "12345",
  "deliveryPincode": "110001",
  "weight": 0.5
}
```

#### Get Order with AWB Details
```
GET /api/shiprocket/order-with-awb/:shiprocketOrderId
```

#### Batch Update Orders with AWB
```
POST /api/shiprocket/batch-update-awb
Body: {
  "orderIds": ["12345", "67890", "11111"]
}
```

#### Update All Orders with AWB/Status
```
POST /api/shiprocket/update-all-orders
```

## Setup Instructions

### 1. **Environment Configuration**
Create a `.env` file in the server directory with:

```env
# Shiprocket Configuration
SHIPROCKET_EMAIL=your-email@example.com
SHIPROCKET_PASSWORD=your-password
SHIPROCKET_PICKUP_PINCODE=110001
SHIPROCKET_PICKUP_LOCATION=warehouse-1

# Server Configuration
PORT=5000
CLIENT_URL=http://localhost:3000
```

### 2. **Get Shiprocket Credentials**
1. Go to [Shiprocket Dashboard](https://app.shiprocket.in/)
2. Sign up/Login to your account
3. Go to Settings > API Settings
4. Note down your email and password
5. Update the `.env` file with your actual credentials

### 3. **Set Pickup Location**
1. In Shiprocket dashboard, go to Settings > Pickup Locations
2. Add your store address as pickup location
3. Note the pincode and update `SHIPROCKET_PICKUP_PINCODE` in `.env`

### 4. **Test the Connection**
```bash
curl http://localhost:5000/api/shiprocket/test
```

### 5. **Update Existing Orders**
To fetch AWB numbers and status for existing orders:

```bash
curl -X POST http://localhost:5000/api/shiprocket/update-all-orders
```

## How It Works

### 1. **Order Creation Flow**
1. Order is created in Shiprocket
2. System automatically attempts to assign AWB
3. If successful, AWB code and courier details are saved
4. If failed, order is still created but AWB assignment is logged

### 2. **AWB Assignment Process**
1. System fetches available couriers for delivery pincode
2. Selects the first available courier
3. Assigns AWB using the selected courier
4. Updates order with AWB code and courier information

### 3. **Status Updates**
- Orders are automatically updated with latest status from Shiprocket
- AWB codes are fetched and stored in Firestore
- Tracking URLs are captured when available

## API Usage Examples

### Get AWB for a Specific Order
```javascript
const response = await fetch('/api/shiprocket/order-with-awb/12345');
const data = await response.json();
console.log('AWB Code:', data.data.awbCode);
console.log('Status:', data.data.status);
console.log('Courier:', data.data.courierName);
```

### Auto-Assign AWB to New Order
```javascript
const response = await fetch('/api/shiprocket/auto-assign-awb', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    shiprocketOrderId: '12345',
    deliveryPincode: '110001',
    weight: 0.5
  })
});
```

### Update All Orders with Latest AWB/Status
```javascript
const response = await fetch('/api/shiprocket/update-all-orders', {
  method: 'POST'
});
const data = await response.json();
console.log(`Updated ${data.successCount} out of ${data.totalOrders} orders`);
```

## Troubleshooting

### Common Issues

1. **"Shiprocket authentication failed"**
   - Check your email and password in .env file
   - Ensure your Shiprocket account is active
   - Verify API access is enabled in Shiprocket dashboard

2. **"No couriers available for the delivery pincode"**
   - Check if the delivery pincode is serviceable
   - Verify pickup location is set correctly
   - Try with a different weight value

3. **"AWB auto-assignment failed"**
   - Check if order exists in Shiprocket
   - Verify courier serviceability
   - Check Shiprocket API status

### Debug Steps

1. **Test Connection**
   ```bash
   curl http://localhost:5000/api/shiprocket/test
   ```

2. **Check Available Couriers**
   ```bash
   curl "http://localhost:5000/api/shiprocket/couriers?pincode=110001&weight=0.5"
   ```

3. **Get Order Details**
   ```bash
   curl http://localhost:5000/api/shiprocket/order-with-awb/YOUR_ORDER_ID
   ```

## Expected Results

After proper setup:
- ✅ Orders will be created in Shiprocket automatically
- ✅ AWB codes will be generated and assigned
- ✅ Order status will be updated in real-time
- ✅ Tracking URLs will be available
- ✅ Courier information will be captured
- ✅ Shipping labels can be generated

## Monitoring

Check server logs for:
- `✅ AWB auto-assigned: [AWB_CODE] via [COURIER_NAME]`
- `✅ Updated order [ORDER_ID]: AWB=[AWB_CODE], Status=[STATUS]`
- `🎉 Update completed: [SUCCESS_COUNT]/[TOTAL_COUNT] orders updated successfully`

## Support

If you encounter issues:
1. Check the server logs for detailed error messages
2. Verify your Shiprocket credentials and account status
3. Test individual API endpoints to isolate the problem
4. Ensure your pickup location is properly configured in Shiprocket
