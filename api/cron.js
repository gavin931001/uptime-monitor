// api/cron.js
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

export default async function handler(request, response) {
  try {
    // 1. 初始化 Firebase Admin (移到 handler 內以捕捉錯誤)
    if (!admin.apps.length) {
      // 檢查環境變數是否存在
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error('找不到環境變數 FIREBASE_SERVICE_ACCOUNT，請至 Vercel Settings 設定。');
      }

      // 嘗試解析 JSON (這是最容易報錯的地方)
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        throw new Error('環境變數 FIREBASE_SERVICE_ACCOUNT 格式錯誤，請確認貼上的是完整的 JSON 內容。');
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();

    // 2. 設定寄信工具
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    // --- 關鍵修改點：取得台灣時區的時間 ---
    const options = {
      timeZone: 'Asia/Taipei', // 確保使用台灣時區
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // 24小時制
    };

    const taiwanDetectionTime = new Date().toLocaleString('zh-TW', options);
    // ------------------------------------

    console.log('⏰ Cron Job 開始執行...');
    
    // 3. 取得所有使用者
    const usersSnapshot = await db.collection('users').get();
    let emailsSent = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const userEmail = userData.email; 

      // 取得該使用者的監控列表
      const monitorsSnapshot = await db.collection(`users/${userId}/monitors`).get();

      for (const monitorDoc of monitorsSnapshot.docs) {
        const monitor = monitorDoc.data();
        const { url: websiteUrl, status: oldStatus, name: websiteName } = monitor; // 為了在 HTML 中使用，重新命名
        
        // 檢查網站狀態... (略)

        let newStatus = 'down';
        let responseTime = 0;
        const startTime = Date.now();

        try {
            // 設定 5 秒 timeout 避免卡住
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const res = await fetch(websiteUrl, { // 使用 websiteUrl
                method: 'HEAD',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (res.ok) newStatus = 'up';
            responseTime = Date.now() - startTime;
        } catch (e) {
            newStatus = 'down';
        }

        // 狀態更新與寄信邏輯
        if (newStatus !== oldStatus) {
            await db.doc(`users/${userId}/monitors/${monitorDoc.id}`).update({
                status: newStatus,
                lastChecked: admin.firestore.FieldValue.serverTimestamp(),
                responseTime: responseTime
            });

            // 只有當狀態變為 down 且該使用者有留 email 時才寄信
            if (newStatus === 'down' && oldStatus !== 'down' && userEmail) {
                console.log(`寄信給 ${userEmail} 通知 ${websiteName} 掛掉了`);
                
                // --- 替換為新的郵件格式 ---
                const mailContent = {
                  from: `"UptimeGuard 監控系統" <${process.env.GMAIL_USER}>`, // 替換寄件人名稱
                  to: userEmail,
                  subject: `[警報] ${websiteName} 網站無法連線！`,
                  html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                      <h2 style="color: #e11d48;">⚠️ 網站異常警報</h2>
                      <p>親愛的用戶您好，</p>
                      <p>您的監控系統偵測到以下網站目前無法連線：</p>
                      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>網站名稱：</strong> ${websiteName}</p>
                        <p><strong>網站網址：</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
                        <p><strong>偵測時間：</strong> ${taiwanDetectionTime}</p> </div>
                      <p>請盡快檢查您的伺服器狀態。</p>
                      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                      <p style="font-size: 12px; color: #888;">此信件由 UptimeGuard 自動發送，請勿回覆。</p>
                    </div>
                  `,
                };
                
                await transporter.sendMail(mailContent);
                emailsSent++;
            }
        } else {
            // 狀態沒變，僅更新時間
            await db.doc(`users/${userId}/monitors/${monitorDoc.id}`).update({
              lastChecked: admin.firestore.FieldValue.serverTimestamp(),
              responseTime: responseTime
            });
        }
      }
    }

    return response.status(200).json({ success: true, emails: emailsSent });

  } catch (error) {
    console.error('Cron Job Error:', error);
    // 回傳 500 但附帶錯誤訊息，方便除錯
    return response.status(500).json({ 
        error: '執行失敗', 
        details: error.message 
    });
  }
}