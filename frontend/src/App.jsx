import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format, isSameDay, subDays, parseISO, fromUnixTime, getUnixTime } from 'date-fns';

/* ---<Configuration start>--- */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'; 
const PRIMARY_COLOR = 'text-yellow-400';
const BORDER_COLOR = 'border-yellow-400';
const BG_BUTTON = 'bg-yellow-400 text-black hover:bg-yellow-300';
const BG_SELECTED_ADJ = 'bg-yellow-400 text-black font-bold'; // 形容詞選中後的亮色樣式
/* ---<Configuration end>--- */

// Toast 提示元件 (取代 Alert)
const Toast = ({ message, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 2000); // 2秒後自動消失
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="fixed top-10 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black px-6 py-2 rounded-full shadow-lg font-bold z-50 animate-bounce">
            {message}
        </div>
    );
};

function App() {
  /* ---<State Management start>--- */
  const [menu, setMenu] = useState({ adjs: [], verbs: [] });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadMoreCount, setLoadMoreCount] = useState(0); 
  const [toastMsg, setToastMsg] = useState(null); // Toast 狀態
  
  // Main Input Form State
  const [form, setForm] = useState({
    adjs: [], 
    verbs: [], 
    isTime: false, 
    weightOrTime: '',
    reps: '',
    rir: '',
    rest: '',
    note: '',
  });

  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // LocalStorage Logic
  useEffect(() => {
    const saved = localStorage.getItem('gym_logger_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (isSameDay(new Date(parsed.date), new Date())) {
        setForm(parsed.form);
      } else {
        localStorage.removeItem('gym_logger_state');
      }
    }
    fetchData();
  }, []);

  // Save State on Change
  useEffect(() => {
    localStorage.setItem('gym_logger_state', JSON.stringify({
      date: new Date(),
      form: form
    }));
  }, [form]);
  /* ---<State Management end>--- */

  /* ---<API Logic start>--- */
  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_URL}/data`);
      setMenu(res.data.menu);
      setLogs(res.data.logs);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (form.verbs.length === 0 || !form.weightOrTime || !form.reps || !form.rir) {
      alert("請填寫必填欄位 (動作, 重量/秒, 下數, RIR)");
      return;
    }

    const timestamp = getUnixTime(new Date());
    const fullExerciseName = [...form.adjs, ...form.verbs].join(' ');

    const todayLogs = logs.filter(l => 
      isSameDay(fromUnixTime(l.unix), new Date()) && 
      l.exercise === fullExerciseName
    );
    const setNumber = todayLogs.length + 1;

    const payload = {
      unix: timestamp,
      exercise: fullExerciseName,
      set: setNumber,
      weight: form.isTime ? `${form.weightOrTime}s` : `${form.weightOrTime}kg`,
      rep: form.reps,
      feeling: form.rir,
      rest: form.rest,
      note: form.note
    };

    const newLog = { ...payload, id: 'temp-' + Date.now() };
    setLogs([newLog, ...logs]);

    try {
      await axios.post(`${API_URL}/save`, payload);
      fetchData(); 
      setForm(prev => ({...prev, note: ''}));
    } catch (err) {
      alert("Save failed");
    }
  };

  // Start Editing
  const handleEditClick = (log) => {
    setEditingId(log.id);
    setEditForm({ ...log }); 
  };

  // Submit Edit (Update)
  const handleEditSave = async () => {
    const newLogs = logs.map(l => l.id === editingId ? editForm : l);
    setLogs(newLogs);
    setEditingId(null);

    try {
        await axios.post(`${API_URL}/update`, { 
            ...editForm, 
            rowId: editForm.id 
        });
    } catch(e) {
        console.error("Update failed", e);
        alert("更新失敗，請檢查網路");
        fetchData();
    }
  };

  // Delete Log
  const handleDelete = async () => {
    if(!window.confirm("確定要刪除這筆紀錄嗎？")) return;

    const newLogs = logs.filter(l => l.id !== editingId);
    setLogs(newLogs);
    setEditingId(null);

    try {
        await axios.post(`${API_URL}/delete`, { rowId: editForm.id });
        // 刪除後因為 Row ID 會改變，建議重新抓取
        setTimeout(fetchData, 1000); 
    } catch (e) {
        console.error("Delete failed", e);
        alert("刪除失敗");
        fetchData();
    }
  };
  /* ---<API Logic end>--- */

  /* ---<Helper Functions start>--- */
  const handleAutoFill = (selectedVerbs) => {
    const searchName = selectedVerbs.join(' ');
    const lastLog = logs.find(l => l.exercise.includes(searchName));
    
    if (lastLog) {
      const isSeconds = lastLog.weight.includes('s');
      const val = lastLog.weight.replace('kg', '').replace('s', '');
      setForm(prev => ({
        ...prev,
        isTime: isSeconds,
        weightOrTime: val,
        reps: lastLog.rep,
        rir: lastLog.feeling,
        rest: lastLog.rest || '' 
      }));
    }
  };

  const toggleSelection = (list, item, field) => {
    const exists = list.includes(item);
    const newList = exists ? list.filter(i => i !== item) : [...list, item];
    setForm({ ...form, [field]: newList });
    if (field === 'verbs') handleAutoFill(newList);
  };

  const copyTodayLogs = () => {
    const todayData = logs.filter(l => isSameDay(fromUnixTime(l.unix), new Date()))
                          .sort((a,b) => a.unix - b.unix);
    
    // 修改複製格式：包含秒數、備註
    const text = todayData.map(l => {
      const timeStr = format(fromUnixTime(l.unix), 'HH:mm:ss'); // 包含秒
      const noteStr = l.note ? ` Note: ${l.note}` : '';
      return `${timeStr} ${l.exercise} Set${l.set} ${l.weight} x ${l.rep} (RIR ${l.feeling}) Rest: ${l.rest}${noteStr}`;
    }).join('\n');

    navigator.clipboard.writeText(text).then(() => {
        setToastMsg("複製成功！"); // 使用 Toast
    });
  };
  /* ---<Helper Functions end>--- */

  /* ---<Render Helpers start>--- */
  const groupedLogs = useMemo(() => {
    const groups = {};
    logs.forEach(log => {
      const dateKey = format(fromUnixTime(log.unix), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  const visibleDays = 1 + 3 + (loadMoreCount * 5); 
  /* ---<Render Helpers end>--- */

  return (
    <div className="min-h-screen pb-10 max-w-md mx-auto relative px-4 pt-4">
      {/* Toast Notification */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* Header */}
      <header className={`text-4xl font-black py-6 text-center ${PRIMARY_COLOR} tracking-tighter flex justify-center items-center gap-2`}>
        {/* Simple Icon inline */}
        <svg width="40" height="40" viewBox="0 0 100 100" className="fill-current text-yellow-400">
           <path d="M20 35 L20 65 M80 35 L80 65" stroke="currentColor" strokeWidth="12" strokeLinecap="round"/>
           <line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" strokeWidth="8"/>
        </svg>
        Gym Logger
      </header>

      {/* ---<Input Section start>--- */ }
      <div className="space-y-4 mb-8 bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-xl">
        
        {/* Output Preview Box */}
        <div className={`p-4 border rounded-lg bg-black font-mono text-base min-h-[60px] flex items-center flex-wrap gap-2 ${BORDER_COLOR}`}>
           {form.adjs.map(a => <span key={a} className="text-gray-400">#{a}</span>)}
           {form.verbs.map(v => <span key={v} className="text-white font-bold">{v}</span>)}
           <span className={PRIMARY_COLOR}>
             {form.weightOrTime}{form.isTime ? 's' : 'kg'} x {form.reps} (RIR{form.rir})
           </span>
           {form.rest && <span className="text-sm text-gray-500">Rest {form.rest}s</span>}
        </div>

        {/* Inputs Grid (字體加大) */}
        <div className="grid grid-cols-3 gap-3">
            <div className="relative col-span-1">
                <input 
                  type="number" 
                  value={form.weightOrTime}
                  onChange={e => setForm({...form, weightOrTime: e.target.value})}
                  placeholder={form.isTime ? "秒數" : "重量"}
                  className="w-full bg-gray-800 rounded p-4 text-center text-white text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 placeholder-gray-600"
                />
                <button 
                  onClick={() => setForm({...form, isTime: !form.isTime})}
                  className="absolute right-1 top-2 text-[10px] text-yellow-500 font-bold border border-yellow-500 rounded px-1"
                >
                    {form.isTime ? 'SEC' : 'KG'}
                </button>
            </div>
            <input 
                type="number" 
                value={form.reps}
                onChange={e => setForm({...form, reps: e.target.value})}
                placeholder="次數"
                className="col-span-1 bg-gray-800 rounded p-4 text-center text-white text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 placeholder-gray-600"
            />
            <input 
                type="number" 
                value={form.rir}
                onChange={e => setForm({...form, rir: e.target.value})}
                placeholder="RIR"
                className="col-span-1 bg-gray-800 rounded p-4 text-center text-white text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 placeholder-gray-600"
            />
        </div>

        {/* Rest Time & Note */}
        <div className="flex items-center gap-2">
            <input 
                type="text"
                value={form.note}
                onChange={e => setForm({...form, note: e.target.value})}
                placeholder="備註 (選填)..."
                className="flex-grow bg-gray-800 rounded p-3 text-white text-base focus:ring-1 focus:ring-yellow-400 placeholder-gray-600"
            />

            <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-500">Rest</span>
                <input 
                    type="number"
                    value={form.rest}
                    onChange={e => setForm({...form, rest: e.target.value})}
                    placeholder="秒"
                    className="w-16 bg-gray-800 rounded p-3 text-center text-white text-base focus:ring-1 focus:ring-yellow-400"
                />
            </div>
        </div>

        {/* Rest Shortcuts */}
        <div className="flex justify-end gap-3">
            {[90, 120, 180].map(t => (
                <button 
                    key={t}
                    onClick={() => setForm({...form, rest: t})}
                    className="text-xs bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-400 hover:text-white"
                >
                    {t}s
                </button>
            ))}
        </div>

        {/* Shortcuts - Adjs (修改選中樣式) */}
        <div className="flex flex-wrap gap-2">
            {menu.adjs.map(item => (
                <button 
                    key={item}
                    onClick={() => toggleSelection(form.adjs, item, 'adjs')}
                    // 這裡改用了 BG_SELECTED_ADJ 變數
                    className={`px-4 py-2 rounded-full text-sm transition-colors ${form.adjs.includes(item) ? BG_SELECTED_ADJ : 'bg-black text-gray-500 border border-gray-800'}`}
                >
                    {item}
                </button>
            ))}
        </div>

        {/* Shortcuts - Verbs */}
        <div className="flex flex-wrap gap-2">
             {menu.verbs.map(item => (
                <button 
                    key={item}
                    onClick={() => toggleSelection(form.verbs, item, 'verbs')}
                    className={`px-4 py-2 rounded-full text-base font-bold transition-colors ${form.verbs.includes(item) ? BG_BUTTON : 'bg-gray-800 text-gray-300'}`}
                >
                    {item}
                </button>
            ))}
        </div>

        <button 
            onClick={handleSave}
            className={`w-full py-4 rounded-lg font-bold text-xl ${BG_BUTTON} active:scale-95 transition-transform shadow-lg shadow-yellow-900/20`}
        >
            加入紀錄
        </button>
      </div>
      {/* ---<Input Section end>--- */ }

      {/* ---<Log Table Section start>--- */}
      <div className="space-y-4">
        {groupedLogs.slice(0, visibleDays).map(([date, dayLogs], idx) => {
            const isToday = isSameDay(parseISO(date), new Date());
            
            return (
                <div key={date} className="border-b border-gray-800 pb-2">
                     <details open={isToday || idx < 3} className="group">
                        <summary className="list-none cursor-pointer flex justify-between items-center mb-4 select-none bg-gray-900/50 p-2 rounded">
                            <div className="flex items-center gap-2">
                                <svg 
                                    className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-90" 
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <h3 className={`font-bold ${isToday ? 'text-2xl text-white' : 'text-lg text-gray-400'}`}>
                                    {format(parseISO(date), 'MM-dd')} {isToday && '(Today)'}
                                </h3>
                            </div>
                            
                            {isToday && (
                                <button onClick={(e) => {e.preventDefault(); copyTodayLogs();}} className="text-sm text-yellow-500 border border-yellow-500 px-3 py-1 rounded active:bg-yellow-500 active:text-black">
                                    複製
                                </button>
                            )}
                        </summary>

                        <div className="space-y-3 mt-2 pl-1">
                            {dayLogs.map((log) => {
                                const isEditing = editingId === log.id;
                                
                                // --- EDIT MODE ---
                                if (isEditing) {
                                    return (
                                        <div key={log.id} className="bg-gray-800 p-3 rounded border border-yellow-500/50 animate-pulse-fast">
                                            <div className="text-sm text-yellow-500 mb-2">編輯紀錄 (Set {log.set})</div>
                                            
                                            {/* 新增：編輯動作名稱 */}
                                            <input 
                                                value={editForm.exercise} 
                                                onChange={e=>setEditForm({...editForm, exercise: e.target.value})} 
                                                className="w-full bg-black text-white p-2 rounded text-left text-base mb-2 border border-gray-700" 
                                                placeholder="動作名稱..."
                                            />

                                            <div className="grid grid-cols-4 gap-2 mb-2">
                                                <input value={editForm.weight} onChange={e=>setEditForm({...editForm, weight: e.target.value})} className="bg-black text-white p-2 rounded text-center text-base" placeholder="重量"/>
                                                <input value={editForm.rep} onChange={e=>setEditForm({...editForm, rep: e.target.value})} className="bg-black text-white p-2 rounded text-center text-base" placeholder="次數"/>
                                                <input value={editForm.feeling} onChange={e=>setEditForm({...editForm, feeling: e.target.value})} className="bg-black text-white p-2 rounded text-center text-base" placeholder="RIR"/>
                                                <input value={editForm.rest} onChange={e=>setEditForm({...editForm, rest: e.target.value})} className="bg-black text-white p-2 rounded text-center text-base" placeholder="Rest"/>
                                            </div>
                                            {/* Note 編輯 */}
                                            <input 
                                                value={editForm.note || ''} 
                                                onChange={e=>setEditForm({...editForm, note: e.target.value})} 
                                                className="w-full bg-black text-white p-2 rounded text-left text-base mb-3" 
                                                placeholder="備註..."
                                            />

                                            <div className="flex justify-between items-center">
                                                {/* 新增：刪除按鈕 */}
                                                <button onClick={handleDelete} className="text-sm bg-red-900 text-red-200 px-4 py-2 rounded hover:bg-red-800">
                                                    刪除此列
                                                </button>

                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingId(null)} className="text-sm bg-gray-700 px-4 py-2 rounded text-white">取消</button>
                                                    <button onClick={handleEditSave} className="text-sm bg-yellow-500 px-4 py-2 rounded text-black font-bold">儲存</button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }

                                // --- VIEW MODE ---
                                return (
                                    <div 
                                        key={log.id} 
                                        onClick={() => handleEditClick(log)} // Click to Edit
                                        className={`grid grid-cols-12 gap-1 text-base items-center p-3 rounded cursor-pointer transition-colors active:scale-[0.99]
                                            ${isToday ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-950 opacity-70 hover:opacity-100'}
                                        `}
                                    >
                                        <div className="col-span-2 text-xs text-gray-500 flex flex-col justify-center">
                                            {format(fromUnixTime(log.unix), 'HH:mm')}
                                        </div>
                                        
                                        {/* 修改：s2 移到前面，字體加大 */}
                                        <div className="col-span-6 font-bold text-white truncate flex items-center gap-2">
                                            <span className="text-sm text-yellow-500 bg-yellow-900/30 px-1 rounded">S{log.set}</span>
                                            <span className="text-lg">{log.exercise}</span>
                                        </div>

                                        <div className="col-span-4 text-right flex justify-end gap-2 text-gray-300 text-lg">
                                            <span>{log.weight}</span>
                                            <span>x{log.rep}</span>
                                            <span className={`${PRIMARY_COLOR} text-sm flex items-center`}>@{log.feeling}</span>
                                        </div>
                                        {/* Rest Time Display */}
                                        <div className="col-span-12 flex justify-between items-start mt-1 pt-1 border-t border-gray-800/50">
                                            {/* 備註 (小字, 灰色) */}
                                            <span className="text-sm text-gray-400 italic text-left flex-grow pr-2">
                                                {log.note}
                                            </span>
                                            
                                            {/* Rest Time */}
                                            {log.rest && (
                                                <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                                                    Rest: {log.rest}s
                                                </span>
                                            )}
                                        </div>
                                        {!log.rest && isToday && (
                                            <div className="col-span-12 text-xs text-right text-gray-700 mt-1 italic">
                                                (點擊紀錄 Rest)
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </details>
                </div>
            )
        })}
        
        <button 
            onClick={() => setLoadMoreCount(c => c + 1)}
            className="w-full py-6 text-gray-500 text-base hover:text-white border-t border-gray-800 mt-4"
        >
            [載入更多歷史紀錄]
        </button>
      </div>
      {/* ---<Log Table Section end>--- */}

      {/* ---<Contribution Graph start>--- */}
      <div className="mt-12 mb-6 p-4 bg-gray-900/50 rounded-xl">
          <h4 className="text-sm text-gray-400 mb-3 font-bold uppercase tracking-widest">Consistency</h4>
          <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-2 justify-end">
              {Array.from({ length: 90 }).map((_, i) => {
                  const day = subDays(new Date(), 89 - i);
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const count = groupedLogs.find(g => g[0] === dayStr)?.[1].length || 0;
                  
                  // Brighter Color Scale (Yellow 400-500 range)
                  let bg = 'bg-gray-800';
                  if (count > 0) bg = 'bg-yellow-900/60'; // 1-3 sets
                  if (count > 3) bg = 'bg-yellow-600';    // 4-6 sets
                  if (count > 6) bg = 'bg-yellow-500';    // 7-10 sets
                  if (count > 10) bg = 'bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.6)]'; // 10+ sets (Glowing)
                  
                  return (
                    <div key={i} className={`w-2 h-2 rounded-sm flex-shrink-0 transition-all ${bg}`} title={`${dayStr}: ${count}`} />
                  )
              })}
          </div>
      </div>
      {/* ---<Contribution Graph end>--- */}

      <footer className="text-center text-xs text-gray-600 py-6">
          designed by sphsieh 2025
      </footer>
    </div>
  );
}

export default App;