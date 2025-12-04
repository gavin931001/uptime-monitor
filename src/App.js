import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot, 
  serverTimestamp, 
  updateDoc,
  setDoc // <--- 注意：setDoc 直接加在這裡，沒有重複的 import 行
} from 'firebase/firestore';
import { 
  Activity, 
  Plus, 
  Trash2, 
  RefreshCw, 
  LogOut, 
  Globe, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Server,
  Mail
} from 'lucide-react';

// --- 設定 Firebase ---
// 請記得填入你的設定
const firebaseConfig = {
  apiKey: "AIzaSyDQ4UFH7fF-yTEnR9orfWBO8En4WLpos-A",
  authDomain: "uptime-monitor-1001.firebaseapp.com",
  projectId: "uptime-monitor-1001",
  storageBucket: "uptime-monitor-1001.firebasestorage.app",
  messagingSenderId: "776008839570",
  appId: "1:776008839570:web:dfe5e07e17022502afd14b",
  measurementId: "G-4HMSNH0599"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function UptimeMonitor() {
  const [user, setUser] = useState(null);
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [checkingIds, setCheckingIds] = useState(new Set());
  
  const prevStatusRef = useRef({});

  // --- 1. 身份驗證 (Google 登入 + 儲存 Email) ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // 當使用者登入時，把 Email 存起來，給後端 Cron Job 用
      if (currentUser) {
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            email: currentUser.email
          }, { merge: true }); // merge 代表只更新 email，不影響其他欄位
        } catch (e) {
          console.error("儲存 Email 失敗:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("登入失敗:", error);
      alert("登入失敗: " + error.message);
    }
  };

  // --- 2. 資料庫監聽 ---
  useEffect(() => {
    if (!user) {
      setMonitors([]);
      return;
    }

    const q = query(collection(db, 'users', user.uid, 'monitors'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMonitors(list);
      
      list.forEach(m => {
        prevStatusRef.current[m.id] = m.status;
      });
    });

    return () => unsubscribe();
  }, [user]);

  // --- 3. 自動更新機制 (前端輔助用) ---
  useEffect(() => {
    if (!user || monitors.length === 0) return;

    const intervalId = setInterval(() => {
      console.log("⏰ 前端觸發自動檢查...");
      checkAll();
    }, 60000); 

    return () => clearInterval(intervalId);
  }, [user, monitors]);

  // --- 4. 動作處理 ---
  const handleAddMonitor = async (e) => {
    e.preventDefault();
    if (!newUrl || !newName || !user) return;
    
    setIsAdding(true);
    try {
      let validUrl = newUrl.trim();
      if (!validUrl.startsWith('http')) {
        validUrl = 'https://' + validUrl;
      }

      await addDoc(collection(db, 'users', user.uid, 'monitors'), {
        name: newName,
        url: validUrl,
        status: 'pending',
        lastChecked: null,
        responseTime: 0,
        createdAt: serverTimestamp()
      });
      setNewUrl('');
      setNewName('');
    } catch (error) {
      console.error("新增失敗:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'monitors', id));
  };

  // --- 5. 核心邏輯 ---
  const handleCheckStatus = async (id, targetUrl, name) => {
    if (!user) return;
    setCheckingIds(prev => new Set(prev).add(id));

    try {
      const response = await fetch(`/api/check?url=${encodeURIComponent(targetUrl)}`);
      
      if (!response.ok) throw new Error('API Error');
      
      const data = await response.json();
      const isUp = data.status === 'up';
      const responseTime = data.responseTime || 0;
      const newStatus = isUp ? 'up' : 'down';

      // 前端觸發的寄信 (作為備用，主要還是靠 Cron Job)
      const prevStatus = prevStatusRef.current[id];
      if (newStatus === 'down' && prevStatus !== 'down') {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            websiteName: name,
            websiteUrl: targetUrl
          })
        }).catch(err => console.error("前端寄信觸發失敗", err));
      }

      await updateDoc(doc(db, 'users', user.uid, 'monitors', id), {
        status: newStatus,
        lastChecked: serverTimestamp(),
        responseTime: responseTime
      });

    } catch (error) {
      console.error("檢查失敗:", error);
      await updateDoc(doc(db, 'users', user.uid, 'monitors', id), {
        status: 'down',
        lastChecked: serverTimestamp(),
        responseTime: 0
      });
    } finally {
      setCheckingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const checkAll = () => {
    monitors.forEach(m => handleCheckStatus(m.id, m.url, m.name));
  };

  // --- UI 元件 ---
  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Activity className="animate-spin text-blue-500 w-10 h-10" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-xl text-center shadow-lg border border-slate-700 max-w-sm w-full">
          <Activity className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h1 className="text-white text-2xl font-bold mb-2">UptimeGuard</h1>
          <p className="text-slate-400 mb-8">專業網站存活監控服務</p>
          
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-white text-slate-900 font-bold py-3 px-4 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            使用 Google 帳號登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-xl text-white">UptimeGuard</span>
            <span className="hidden md:inline-flex items-center gap-1 text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded ml-2 border border-slate-700">
              <Clock className="w-3 h-3" /> 每1分鐘自動更新
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                {user.email ? user.email[0].toUpperCase() : 'U'}
              </div>
              <span className="hidden md:inline">{user.email}</span>
            </div>
            <button onClick={() => signOut(auth)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <form onSubmit={handleAddMonitor} className="flex-1 bg-slate-900 p-2 rounded-xl border border-slate-800 flex gap-2 shadow-lg">
            <div className="flex-1 flex gap-2">
              <input type="text" placeholder="網站名稱" className="bg-transparent border-none focus:ring-0 text-white px-4 py-2 w-1/3" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <div className="w-px bg-slate-800 my-2"></div>
              <input type="text" placeholder="https://..." className="bg-transparent border-none focus:ring-0 text-white px-4 py-2 w-2/3" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} required />
            </div>
            <button type="submit" disabled={isAdding} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap shadow-md"><Plus className="w-4 h-4" /> 新增</button>
          </form>
          <button onClick={checkAll} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 border border-slate-700 whitespace-nowrap justify-center shadow-lg"><RefreshCw className="w-4 h-4" /> 立即檢查</button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {monitors.map((monitor) => (
            <div key={monitor.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between group hover:border-blue-500/30 transition-all shadow-md">
              <div className="flex items-start gap-4 mb-4 md:mb-0 w-full md:w-auto">
                <div className={`mt-1 w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-inner ${
                  monitor.status === 'up' ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20' :
                  monitor.status === 'down' ? 'bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {monitor.status === 'up' ? <CheckCircle2 className="w-5 h-5" /> : monitor.status === 'down' ? <AlertCircle className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-medium text-white flex items-center gap-2">
                    {monitor.name}
                    {monitor.status === 'down' && <span className="flex items-center gap-1 text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded"><Mail className="w-3 h-3"/> 已警示</span>}
                  </h3>
                  <p className="text-sm text-slate-500 font-mono mt-0.5">{monitor.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                <div className="text-right mr-4">
                  <div className="flex items-center justify-end gap-2 text-sm text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{monitor.lastChecked ? new Date(monitor.lastChecked.seconds * 1000).toLocaleTimeString() : '--:--'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDelete(monitor.id)} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-600 hover:text-white transition-all shadow-sm"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {monitors.length === 0 && <div className="text-center py-20 text-slate-500">尚無監控項目</div>}
        </div>
      </main>
    </div>
  );
}