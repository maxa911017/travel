import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Image as ImageIcon, MapPin, LayoutTemplate, Plus, Check, X, Bookmark, Filter, Upload, Loader2, Sparkles, ImagePlus, Trash2, Layers, Cloud, CloudOff, RefreshCw } from 'lucide-react';

// === Firebase 雲端資料庫模組 ===
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';

// === 初始化 Firebase ===
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyDhAILsfNhhf-WdeJa-utgz_PVy6zARVHA",
  authDomain: "photo-e8d53.firebaseapp.com",
  projectId: "photo-e8d53",
  storageBucket: "photo-e8d53.firebasestorage.app",
  messagingSenderId: "265524311162",
  appId: "1:265524311162:web:d7d5897ba20155537c37c3",
  measurementId: "G-1DW5BPSMV1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// === 初始範例資料庫 ===
const SAMPLE_PHOTOS = [
  { url: 'https://images.unsplash.com/photo-1493770348161-369560ae357d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', title: '精緻早午餐特寫', content: '餐飲與美食', design: '質感特寫', location: '法國巴黎' },
  { url: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', title: '塞納河畔日落', content: '自然與人文', design: '主視覺 (大圖)', location: '法國巴黎' },
  { url: 'https://images.unsplash.com/photo-1480796927426-f609979314bd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', title: '東京新宿街頭', content: '景點與娛樂', design: '情境氛圍', location: '日本東京' },
  { url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', title: '壯麗群山雲海', content: '自然與人文', design: '主視覺 (大圖)', location: '台灣花蓮' }
];

const DEFAULT_CATEGORIES = {
  content: ['景點與娛樂', '餐飲與美食', '住宿與交通', '自然與人文'],
  design: ['主視覺 (大圖)', '情境氛圍', '質感特寫'],
  location: ['日本東京', '日本北海道', '法國巴黎', '台灣花蓮', '台灣墾丁', '未定位']
};

export default function App() {
  // === 狀態管理 ===
  const [user, setUser] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ content: [], design: [], location: [] });
  const [moodBoard, setMoodBoard] = useState([]);

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState('idle');
  const [uploadBatch, setUploadBatch] = useState([]);
  const fileInputRef = useRef(null);

  // 新增：客製化 Modal 狀態 (因為預覽環境阻擋原生 alert/prompt)
  const [tagModal, setTagModal] = useState({ isOpen: false, type: '', error: '' });
  const [newTagValue, setNewTagValue] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: '', action: null });

  // === Firebase 認證與監聽 ===
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token && typeof __firebase_config !== 'undefined' && __firebase_config) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // === 取得雲端照片資料 ===
  useEffect(() => {
    if (!user) return;
    
    // 取得自訂標籤設定
    const tagsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'tags');
    const unsubscribeTags = onSnapshot(tagsRef, (docSnap) => {
      if (docSnap.exists()) {
        setCategories(docSnap.data());
      }
    });

    // 定義個人的照片集合路徑
    const photosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'photos');
    
    const unsubscribePhotos = onSnapshot(photosRef, (snapshot) => {
      const fetchedPhotos = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // 依據建立時間排序 (新的在前)
      fetchedPhotos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setPhotos(fetchedPhotos);
      setIsLoading(false);
    }, (error) => {
      console.error("Fetch photos error:", error);
      setIsLoading(false);
    });

    return () => {
      unsubscribeTags();
      unsubscribePhotos();
    };
  }, [user]);

  // === 新增/刪除自訂標籤 (客製化 UI 版) ===
  const openAddTagModal = (type) => {
    setTagModal({ isOpen: true, type, error: '' });
    setNewTagValue('');
  };

  const confirmAddTag = async () => {
    const { type } = tagModal;
    const tag = newTagValue.trim();
    if (!tag) {
      setTagModal(prev => ({ ...prev, error: '標籤名稱不能為空' }));
      return;
    }
    if (categories[type].includes(tag)) {
      setTagModal(prev => ({ ...prev, error: '該標籤已經存在！' }));
      return;
    }

    const updatedCategories = {
      ...categories,
      [type]: [...categories[type], tag]
    };

    setCategories(updatedCategories);

    if (user) {
      const tagsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'tags');
      await setDoc(tagsRef, updatedCategories, { merge: true });
    }
    setTagModal({ isOpen: false, type: '', error: '' });
  };

  const handleDeleteTag = (type, tagToDelete, e) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      message: `確定要刪除「${tagToDelete}」這個標籤嗎？`,
      action: async () => {
        const updatedCategories = {
          ...categories,
          [type]: categories[type].filter(t => t !== tagToDelete)
        };
        setCategories(updatedCategories);
        // 同步清除正在使用的篩選器
        setFilters(prev => ({
           ...prev,
           [type]: prev[type].filter(t => t !== tagToDelete)
        }));
        if (user) {
          const tagsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'tags');
          await setDoc(tagsRef, updatedCategories, { merge: true });
        }
        setConfirmDialog({ isOpen: false, action: null, message: '' });
      }
    });
  };

  // === 匯入範例照片 ===
  const handleImportSamples = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const photosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'photos');
      for (const sample of SAMPLE_PHOTOS) {
        await addDoc(photosRef, { ...sample, createdAt: Date.now() });
      }
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  // === 刪除照片 ===
  const handleDeletePhoto = (id) => {
    if (!user) return;
    setConfirmDialog({
      isOpen: true,
      message: "確定要刪除這張照片嗎？",
      action: async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'photos', id));
          setMoodBoard(prev => prev.filter(p => p.id !== id));
        } catch (e) {
          console.error("Error deleting document: ", e);
        }
        setConfirmDialog({ isOpen: false, action: null, message: '' });
      }
    });
  };

  // === 圖片壓縮引擎 (避免大圖塞爆資料庫) ===
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // 限制最大寬度
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height && width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          } else if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); // 壓縮為 70% 品質 JPEG
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  // === 處理批量檔案上傳與 AI 模擬 ===
  const handleBatchUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsBatchModalOpen(true);
    setBatchStatus('analyzing');

    try {
      // 1. 圖片平行壓縮處理
      const processedBatch = await Promise.all(files.map(async (file, index) => {
        const base64Url = await compressImage(file);
        return {
          id: `batch-${Date.now()}-${index}`,
          url: base64Url,
          originalName: file.name,
          suggestions: { title: '分析中...', content: '', design: '', location: '' }
        };
      }));
      setUploadBatch(processedBatch);

      // 2. 模擬 AI 平行運算 (2.5秒後回傳標籤)
      setTimeout(() => {
        const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
        setUploadBatch(currentBatch => currentBatch.map(item => ({
          ...item,
          suggestions: {
            title: randomItem(['旅行碎片', '質感光影', '街角隨拍', '壯闊視野', '美食探索']) + ' - ' + item.originalName.substring(0, 4),
            content: randomItem(categories.content),
            design: randomItem(categories.design),
            location: randomItem(categories.location)
          }
        })));
        setBatchStatus('review');
      }, 2500);

    } catch (err) {
      console.error("Upload error:", err);
      setBatchStatus('idle');
      setIsBatchModalOpen(false);
    }
    
    e.target.value = null; // 重置 input
  };

  const updateBatchItem = (id, field, value) => {
    setUploadBatch(prev => prev.map(item => item.id === id ? { ...item, suggestions: { ...item.suggestions, [field]: value } } : item));
  };

  const removeBatchItem = (id) => {
    setUploadBatch(prev => prev.filter(item => item.id !== id));
    if (uploadBatch.length === 1) closeBatchModal();
  };

  // === 儲存至雲端資料庫 ===
  const handleSaveBatch = async () => {
    if (!user) return;
    setBatchStatus('saving');
    
    const photosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'photos');
    
    try {
      for (const item of uploadBatch) {
        await addDoc(photosRef, {
          url: item.url,
          ...item.suggestions,
          createdAt: Date.now()
        });
      }
      closeBatchModal();
    } catch (e) {
      console.error("Error saving batch to cloud: ", e);
      setBatchStatus('review');
    }
  };

  const closeBatchModal = () => {
    setIsBatchModalOpen(false);
    setTimeout(() => { setBatchStatus('idle'); setUploadBatch([]); }, 300);
  };

  // === 處理左側標籤篩選與企劃板 ===
  const toggleFilter = (type, value) => {
    setFilters(prev => {
      const current = prev[type];
      const updated = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
      return { ...prev, [type]: updated };
    });
  };

  const toggleMoodBoard = (photo) => {
    setMoodBoard(prev => prev.find(p => p.id === photo.id) ? prev.filter(p => p.id !== photo.id) : [...prev, photo]);
  };

  // === 照片網格過濾邏輯 ===
  const filteredPhotos = useMemo(() => {
    return photos.filter(photo => {
      const matchSearch = photo.title.toLowerCase().includes(searchQuery.toLowerCase()) || (photo.location && photo.location.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchContent = filters.content.length === 0 || filters.content.includes(photo.content);
      const matchDesign = filters.design.length === 0 || filters.design.includes(photo.design);
      const matchLocation = filters.location.length === 0 || filters.location.includes(photo.location);
      return matchSearch && matchContent && matchDesign && matchLocation;
    });
  }, [photos, filters, searchQuery]);

  // === 左側選單 Checkbox 元件 ===
  const FilterCheckbox = ({ type, value, label }) => {
    const isChecked = filters[type].includes(value);
    return (
      <div className="flex items-center justify-between group mb-2">
        <label className="flex items-center space-x-2 cursor-pointer flex-1" onClick={() => toggleFilter(type, value)}>
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 group-hover:border-blue-500'}`}>
            {isChecked && <Check size={12} className="text-white" />}
          </div>
          <span className="text-sm text-gray-700">{label || value}</span>
        </label>
        <button onClick={(e) => handleDeleteTag(type, value, e)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded" title="刪除標籤">
          <X size={14} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800 relative">
      
      {/* === 1. 左側過濾面板 === */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto shrink-0 z-10">
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-xl font-bold tracking-wider text-gray-900 flex items-center gap-2">
            <Sparkles className="text-blue-600" size={22} /> TravelLens
          </h1>
          <div className="flex items-center gap-1 mt-2 text-xs font-medium">
            {user ? (
              <span className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-full"><Cloud size={12} className="mr-1"/> 雲端已連線</span>
            ) : (
              <span className="flex items-center text-red-500 bg-red-50 px-2 py-1 rounded-full"><CloudOff size={12} className="mr-1"/> 雲端連線中...</span>
            )}
          </div>
        </div>

        <div className="p-5 flex-1">
          <div className="relative mb-6">
            <input type="text" placeholder="搜尋關鍵字..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-md text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all" />
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><Bookmark size={16} className="text-blue-500" /> 內容與體驗</div>
              <button onClick={() => openAddTagModal('content')} className="text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 p-1 rounded-full transition-colors" title="新增標籤"><Plus size={12} /></button>
            </h3>
            {categories.content.map(cat => <FilterCheckbox key={cat} type="content" value={cat} />)}
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><LayoutTemplate size={16} className="text-purple-500" /> 版面設計功能</div>
              <button onClick={() => openAddTagModal('design')} className="text-gray-400 hover:text-purple-600 bg-gray-100 hover:bg-purple-50 p-1 rounded-full transition-colors" title="新增標籤"><Plus size={12} /></button>
            </h3>
            {categories.design.map(cat => <FilterCheckbox key={cat} type="design" value={cat} />)}
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><MapPin size={16} className="text-green-500" /> 地理位置</div>
              <button onClick={() => openAddTagModal('location')} className="text-gray-400 hover:text-green-600 bg-gray-100 hover:bg-green-50 p-1 rounded-full transition-colors" title="新增標籤"><Plus size={12} /></button>
            </h3>
            {categories.location.map(cat => <FilterCheckbox key={cat} type="location" value={cat} />)}
          </div>
        </div>
      </aside>

      {/* === 2. 中央照片網格 === */}
      <main className="flex-1 flex flex-col h-full overflow-hidden z-10">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={18} />
            <span>雲端共 {photos.length} 張 / 篩選出 {filteredPhotos.length} 張</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setFilters({content: [], design: [], location: []})} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">清除條件</button>
            <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={handleBatchUpload} />
            
            <button onClick={() => fileInputRef.current?.click()} disabled={!user} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
              <Layers size={16} /> 批量上傳與分析
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <RefreshCw size={32} className="animate-spin mb-4 text-blue-500" />
              <p>正在同步雲端圖庫...</p>
            </div>
          ) : photos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <ImageIcon size={64} className="mb-4 opacity-20" />
              <h2 className="text-lg font-bold text-gray-700 mb-2">你的雲端圖庫目前是空的</h2>
              <p className="mb-6 text-sm">點擊右上角上傳照片，或是先載入一些範例圖庫來體驗功能。</p>
              <button onClick={handleImportSamples} className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
                匯入範例照片
              </button>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Filter size={48} className="mb-4 opacity-20" />
              <p>沒有找到符合條件的照片，請嘗試調整篩選器。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPhotos.map(photo => {
                const isSelected = moodBoard.some(p => p.id === photo.id);
                return (
                  <div key={photo.id} className="group bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
                    <div className="relative aspect-video bg-gray-200 overflow-hidden shrink-0">
                      <img src={photo.url} alt={photo.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <button onClick={() => toggleMoodBoard(photo)} className={`absolute top-2 right-2 p-1.5 rounded-full shadow-sm backdrop-blur-sm transition-colors z-10 ${isSelected ? 'bg-blue-600 text-white' : 'bg-white/80 text-gray-700 hover:bg-white'}`}>
                        {isSelected ? <Check size={18} /> : <Plus size={18} />}
                      </button>
                      <button onClick={() => handleDeletePhoto(photo.id)} className="absolute top-2 left-2 p-1.5 rounded-full bg-red-500/80 text-white shadow-sm backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all z-10">
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute bottom-2 left-2 flex gap-1 z-10">
                        <span className="px-2 py-1 text-[10px] font-medium bg-black/60 text-white rounded backdrop-blur-sm shadow-sm flex items-center gap-1">
                          <LayoutTemplate size={10} /> {photo.design}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h4 className="font-medium text-gray-900 mb-1 truncate" title={photo.title}>{photo.title}</h4>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-2">
                        <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded"><Bookmark size={12}/> {photo.content}</span>
                        <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded"><MapPin size={12}/> {photo.location}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* === 3. 右側企劃板 === */}
      <aside className="w-72 bg-white border-l border-gray-200 flex flex-col h-full shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900 flex items-center justify-between">
            本期雜誌企劃板
            <span className="bg-blue-100 text-blue-700 text-xs py-0.5 px-2 rounded-full">{moodBoard.length} 張</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">挑選好的排版素材</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {moodBoard.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-3 px-4">
              <LayoutTemplate size={32} className="opacity-20" />
              <p className="text-sm">點擊照片右上角的 "+" <br/>將素材加入企劃板</p>
            </div>
          ) : (
            moodBoard.map(photo => (
              <div key={`mood-${photo.id}`} className="relative group bg-gray-50 rounded-md p-2 flex gap-3 border border-gray-100">
                <img src={photo.url} alt={photo.title} className="w-16 h-16 object-cover rounded shadow-sm" />
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h5 className="text-sm font-medium text-gray-900 truncate">{photo.title}</h5>
                  <p className="text-xs text-gray-500 truncate">{photo.design}</p>
                </div>
                <button onClick={() => toggleMoodBoard(photo)} className="absolute -top-2 -right-2 bg-white border shadow-sm text-gray-400 hover:text-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-gray-100 bg-white">
          <button disabled={moodBoard.length === 0} className={`w-full py-2.5 rounded-md text-sm font-medium transition-colors ${moodBoard.length > 0 ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            匯出排版資源
          </button>
        </div>
      </aside>

      {/* === 4. 批量 AI 辨識與校對 Modal === */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 md:p-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-full max-h-[85vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">批量 AI 視覺解析與校對</h2>
                  <p className="text-xs text-gray-500">正在處理 {uploadBatch.length} 張照片</p>
                </div>
              </div>
              {batchStatus === 'analyzing' && (
                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full text-sm font-medium">
                  <Loader2 size={16} className="animate-spin" /> 雲端運算中...
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-100/50 p-6">
              <div className="space-y-4">
                {uploadBatch.map((item, index) => (
                  <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-5 relative group">
                    <div className="w-full md:w-48 h-32 rounded-lg overflow-hidden relative shrink-0 bg-gray-100 border border-gray-100">
                      <img src={item.url} className="w-full h-full object-cover" alt="預覽" />
                      {batchStatus === 'analyzing' && (
                        <div className="absolute inset-0 bg-blue-900/40 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-[scan_1.5s_ease-in-out_infinite]" 
                               style={{ animationDelay: `${index * 0.2}s`, animationDirection: 'alternate' }} />
                          <Sparkles size={24} className="text-white animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="flex justify-between items-start mb-3">
                        <input 
                          type="text" 
                          value={item.suggestions.title} 
                          onChange={(e) => updateBatchItem(item.id, 'title', e.target.value)}
                          disabled={batchStatus === 'analyzing' || batchStatus === 'saving'}
                          className="font-medium text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-gray-50 outline-none px-1 py-0.5 w-full max-w-sm transition-colors disabled:bg-transparent"
                        />
                        <button onClick={() => removeBatchItem(item.id)} className="text-gray-400 hover:text-red-500 p-1 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 flex items-center gap-1"><Bookmark size={10}/> 內容</label>
                          <select value={item.suggestions.content} onChange={(e) => updateBatchItem(item.id, 'content', e.target.value)} disabled={batchStatus === 'analyzing' || batchStatus === 'saving'} className="w-full text-xs border border-gray-200 rounded p-1.5 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50">
                            <option value="" disabled>請選擇</option>
                            {categories.content.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 flex items-center gap-1"><LayoutTemplate size={10}/> 設計</label>
                          <select value={item.suggestions.design} onChange={(e) => updateBatchItem(item.id, 'design', e.target.value)} disabled={batchStatus === 'analyzing' || batchStatus === 'saving'} className="w-full text-xs border border-gray-200 rounded p-1.5 focus:ring-1 focus:ring-purple-500 outline-none disabled:bg-gray-50">
                            <option value="" disabled>請選擇</option>
                            {categories.design.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 flex items-center gap-1"><MapPin size={10}/> 地點</label>
                          <select value={item.suggestions.location} onChange={(e) => updateBatchItem(item.id, 'location', e.target.value)} disabled={batchStatus === 'analyzing' || batchStatus === 'saving'} className="w-full text-xs border border-gray-200 rounded p-1.5 focus:ring-1 focus:ring-green-500 outline-none disabled:bg-gray-50">
                            <option value="" disabled>請選擇</option>
                            {categories.location.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-between items-center shrink-0">
              <button onClick={closeBatchModal} disabled={batchStatus === 'saving'} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors text-sm disabled:opacity-50">
                取消匯入
              </button>
              <button onClick={handleSaveBatch} disabled={batchStatus === 'analyzing' || batchStatus === 'saving'} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 transition-colors shadow-sm">
                {batchStatus === 'analyzing' ? '等待解析...' : batchStatus === 'saving' ? '儲存至雲端...' : `確認並收錄全部 (${uploadBatch.length}張)`}
                {batchStatus !== 'analyzing' && batchStatus !== 'saving' && <ImagePlus size={18} />}
                {batchStatus === 'saving' && <Loader2 size={18} className="animate-spin" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === 5. 客製化 UI 彈出視窗 (取代原生的 alert/prompt/confirm) === */}
      {tagModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 w-80 shadow-xl transform transition-all">
            <h3 className="font-bold text-gray-900 mb-4">新增自訂標籤</h3>
            <input 
              type="text" 
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              placeholder="請輸入標籤名稱..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-2"
              onKeyDown={(e) => e.key === 'Enter' && confirmAddTag()}
              autoFocus
            />
            {tagModal.error && <p className="text-red-500 text-xs mb-4">{tagModal.error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTagModal({ isOpen: false, type: '', error: '' })} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">取消</button>
              <button onClick={confirmAddTag} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">確定</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 w-80 shadow-xl transform transition-all">
            <h3 className="font-bold text-gray-900 mb-2">確認操作</h3>
            <p className="text-gray-600 text-sm mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDialog({ isOpen: false, action: null, message: '' })} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">取消</button>
              <button onClick={confirmDialog.action} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors">確定</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes scan { 0% { transform: translateY(0); } 100% { transform: translateY(120px); } }`}</style>
    </div>
  );
}