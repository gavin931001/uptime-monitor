# 🛡️ UptimeGuard - 雲端網站存活監控系統

一個基於 Serverless 架構的網站監控服務，提供 24/7 自動檢查與即時 Email 告警功能。

## 📖 專案簡介 (Introduction)

UptimeGuard 是一個為開發者與學生設計的網站狀態監控工具。為了解決手動檢查網站是否存活的痛點，本系統提供了一個直觀的儀表板，並結合雲端自動化技術，實現「關閉網頁後依然能在背景持續監控」的目標。

當偵測到目標網站無法連線 (Down) 時，系統會透過 SMTP 自動發送警報信件至使用者的 Google 信箱，確保能在第一時間發現並修復問題。

## ✨ 核心功能 (Features)

- **🔐 Google 第三方登入**：整合 Firebase Auth，一鍵快速登入，自動同步使用者 Email。
- **📊 即時監控儀表板**：視覺化顯示所有網站的存活狀態 (Up/Down)、回應時間 (Latency) 與最後檢查時間。
- **☁️ Serverless 後端檢測**：利用 Vercel Serverless Functions 繞過瀏覽器 CORS 限制，進行真實的 HTTP Pinging。
- **⏰ 24/7 背景自動排程**：整合 cron-job.org 與 Vercel API，即使關閉瀏覽器，系統仍會每 5 分鐘自動巡檢。
- **📧 智慧 Email 告警**：當網站狀態由「正常」轉為「異常」時，自動觸發 Nodemailer 發送通知信。

## 🛠️ 技術架構 (Tech Stack)

| 領域 | 技術/工具 | 用途 |
| :--- | :--- | :--- |
| Frontend | React.js, Tailwind CSS | 使用者介面與響應式設計 |
| Backend | Vercel Serverless Functions (Node.js) | 處理 API 請求、CORS 代理、寄信邏輯 |
| Database | Firebase Firestore | NoSQL 資料庫，即時同步監控數據 |
| Auth | Firebase Authentication | Google OAuth 身份驗證 |
| Automation | cron-job.org | 外部觸發器，解決 Vercel 免費版排程限制 |
| Icons | Lucide React | UI 圖標庫 |

## 🚀 系統架構圖 (System Architecture)

```mermaid
graph TD
    User[使用者] -->|登入/管理| Frontend["React 前端 (Vercel)"]
    Frontend -->|讀寫數據| Firestore[Firebase Firestore]
    Frontend -->|Google Auth| FirebaseAuth[Firebase Authentication]
    
    Cron[cron-job.org] -->|每5分鐘觸發| BackendAPI[Vercel Serverless API]
    BackendAPI -->|讀取列表| Firestore
    BackendAPI -->|HTTP Ping| TargetWeb[目標網站]
    
    TargetWeb -->|回傳狀態 200/500| BackendAPI
    BackendAPI -->|更新狀態| Firestore
    BackendAPI -->|狀態異常 (Down)| EmailService[Gmail SMTP]
    EmailService -->|發送警報| User
```
