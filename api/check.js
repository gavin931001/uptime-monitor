// 這是一個 Serverless Function，部署到 Vercel 後會自動變成 API
// 它的工作是：接收前端傳來的網址 -> 去 Ping 那個網址 -> 回傳狀態給前端

export default async function handler(request, response) {
  // 1. 取得前端傳來的網址參數，例如: /api/check?url=https://google.com
  const { url } = request.query;

  if (!url) {
    return response.status(400).json({ error: 'Missing URL parameter' });
  }

  const startTime = Date.now();

  try {
    // 2. 真的發送請求去檢查目標網站 (預設超時設定為 5 秒)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const fetchRes = await fetch(url, {
      method: 'HEAD', // 只抓標頭，不抓內容，速度更快且省流量
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // 3. 判斷狀態
    // 2xx-3xx 視為正常，4xx-5xx 視為異常
    if (fetchRes.ok) {
      return response.status(200).json({
        status: 'up',
        statusCode: fetchRes.status,
        responseTime: responseTime
      });
    } else {
      return response.status(200).json({
        status: 'down',
        statusCode: fetchRes.status,
        responseTime: responseTime
      });
    }

  } catch (error) {
    // 4. 處理連線失敗 (例如網址打錯、DNS 錯誤、超時)
    return response.status(200).json({
      status: 'down',
      error: error.message,
      responseTime: 0
    });
  }
}