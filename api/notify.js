import nodemailer from 'nodemailer';

export default async function handler(request, response) {
  const { email, websiteName, websiteUrl } = request.body;

  if (!email || !websiteName) {
    return response.status(400).json({ error: 'Missing info' });
  }

  // --- 關鍵修改點：取得台灣時區的時間 ---
  // 1. 設定 toLocaleString() 的選項，指定台灣 (Asia/Taipei)
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

  // 2. 格式化時間，使用中文/台灣地區設定
  const taiwanDetectionTime = new Date().toLocaleString('zh-TW', options);
  // ------------------------------------

  // 設定 Gmail 發信器
  // 注意：這裡的密碼必須是 Google 的 "應用程式密碼" (App Password)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // 你的 Gmail 帳號
      pass: process.env.GMAIL_PASS, // 你的 Gmail 應用程式密碼
    },
  });

  const mailOptions = {
    from: `"UptimeGuard 監控系統" <${process.env.GMAIL_USER}>`,
    to: email, // 寄給登入的使用者
    subject: `[警報] ${websiteName} 網站無法連線！`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #e11d48;">⚠️ 網站異常警報</h2>
        <p>親愛的用戶您好，</p>
        <p>您的監控系統偵測到以下網站目前無法連線：</p>
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>網站名稱：</strong> ${websiteName}</p>
          <p><strong>網站網址：：</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
          <p><strong>偵測時間：</strong> ${taiwanDetectionTime}</p>
        </div>
        <p>請盡快檢查您的伺服器狀態。</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">此信件由 UptimeGuard 自動發送，請勿回覆。</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return response.status(200).json({ success: true });
  } catch (error) {
    console.error('Email send failed:', error);
    return response.status(500).json({ error: error.message });
  }
}
