import admin from 'firebase-admin';

let firebaseApp = null;

export function initializeFirebase() {
  try {
    // Check if Firebase credentials are provided
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
      console.warn('⚠️  Firebase credentials not found in environment variables. Push notifications will be disabled.');
      return null;
    }

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    return null;
  }
}

export async function sendPushNotification(fcmToken, title, body, data = {}) {
  try {
    if (!firebaseApp) {
      console.warn('Push notification skipped - Firebase not initialized');
      return null;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data,
      token: fcmToken,
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Push notification sent successfully:', response);
    return response;
  } catch (error) {
    console.error('❌ Failed to send push notification:', error.message);
    return null;
  }
}

export async function sendPushNotificationToMultiple(fcmTokens, title, body, data = {}) {
  try {
    if (!firebaseApp || !fcmTokens || fcmTokens.length === 0) {
      console.warn('Push notification skipped - Firebase not initialized or no tokens');
      return null;
    }

    // Filter out null/undefined tokens
    const validTokens = fcmTokens.filter(token => token);
    
    if (validTokens.length === 0) {
      console.warn('No valid FCM tokens found');
      return null;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data,
      tokens: validTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Push notifications sent: ${response.successCount}/${validTokens.length} successful`);
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${idx}:`, resp.error);
        }
      });
    }

    return response;
  } catch (error) {
    console.error('❌ Failed to send push notifications:', error.message);
    return null;
  }
}

export default { initializeFirebase, sendPushNotification, sendPushNotificationToMultiple };
