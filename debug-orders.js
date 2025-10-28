// Debug script to check orders in Firebase
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('./server/firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://varaha-silks-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.firestore();

async function debugOrders() {
  try {
    console.log('🔍 Debugging orders in Firebase...');
    
    // Get all orders
    const ordersSnapshot = await db.collection('orders').get();
    console.log(`📦 Total orders in database: ${ordersSnapshot.docs.length}`);
    
    if (ordersSnapshot.docs.length === 0) {
      console.log('❌ No orders found in database');
      return;
    }
    
    // Show first few orders
    console.log('\n📋 First 5 orders:');
    ordersSnapshot.docs.slice(0, 5).forEach((doc, index) => {
      const data = doc.data();
      console.log(`\nOrder ${index + 1}:`);
      console.log(`  ID: ${doc.id}`);
      console.log(`  Order ID: ${data.orderId || 'N/A'}`);
      console.log(`  User ID: ${data.userId || 'N/A'}`);
      console.log(`  Customer Email: ${data.customerInfo?.email || data.customerEmail || 'N/A'}`);
      console.log(`  Logged In User Email: ${data.loggedInUserEmail || 'N/A'}`);
      console.log(`  Created At: ${data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt || 'N/A'}`);
      console.log(`  Status: ${data.status || data.orderStatus || 'N/A'}`);
    });
    
    // Check for different user identification fields
    const userIdFields = ['userId', 'customerInfo.email', 'customerEmail', 'loggedInUserEmail'];
    const fieldCounts = {};
    
    for (const field of userIdFields) {
      let count = 0;
      ordersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (data[parent] && data[parent][child]) {
            count++;
          }
        } else if (data[field]) {
          count++;
        }
      });
      fieldCounts[field] = count;
    }
    
    console.log('\n📊 User identification field usage:');
    Object.entries(fieldCounts).forEach(([field, count]) => {
      console.log(`  ${field}: ${count} orders`);
    });
    
  } catch (error) {
    console.error('❌ Error debugging orders:', error);
  } finally {
    process.exit(0);
  }
}

debugOrders();
