import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format, isSameDay, subDays, parseISO, fromUnixTime, getUnixTime } from 'date-fns';

/* ---<Configuration start>--- */
// 本地開發用 http://localhost:3001，Zeabur 上通常會用相對路徑或環境變數
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'; 
const PRIMARY_COLOR = 'text-yellow-400';
const BORDER_COLOR = 'border-yellow-400';
const BG_BUTTON = 'bg-yellow-400 text-black hover:bg-yellow-300';
/* ---<Configuration end>--- */

function App() {
  /* ---<State Management start>--- */
  const [menu, setMenu] = useState({ adjs: [], verbs: [] });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadMoreCount, setLoadMoreCount] = useState(0); // 0 = default 3 days
  
  // Form State
  const [form, setForm] = useState({
    adjs: [], // array
    verbs: [], // array
    isTime: false, // true = seconds, false = kg
    weightOrTime: '',
    reps: '',
    rir: '',
    rest: '',
  });

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

    // Calculate Set Number for Today
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
      rest: form.rest
    };

    // Optimistic Update (UI first)
    const newLog = { ...payload, id: 'temp-' + Date.now() };
    setLogs([newLog, ...logs]);

    try {
      await axios.post(`${API_URL}/save`, payload);
      // Update form logic: keep verb/adj/weight, clear rest? 
      // User requested: "紀錄過後仍留著輸出框內容" -> Do nothing to form.
      fetchData(); // Sync ID and formatting
    } catch (err) {
      alert("Save failed");
    }
  };

  const handleUpdateLog = async (log, field, value) => {
    // 簡單實作：若要修改，需調用後端 update API
    // 這裡僅示範 UI 觸發，請確保後端有 /api/update
     const newLogs = logs.map(l => l.id === log.id ? { ...l, [field]: value } : l);
     setLogs(newLogs);
     if(!log.id.toString().startsWith('temp')) {
         try {
             await axios.post(`${API_URL}/update`, { ...log, [field]: value, rowId: log.id });
         } catch(e) { console.error("Update failed"); }
     }
  };
  /* ---<API Logic end>--- */

  /* ---<Helper Functions start>--- */
  const handleAutoFill = (selectedVerbs) => {
    // Logic: Find most recent log with ANY of these verbs
    const searchName = selectedVerbs.join(' '); // 簡化：假設完全匹配動作組合
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
        rest: lastLog.rest || '' // Use last rest or empty? Prompt implies auto W,X,Y,T
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
                          .sort((a,b) => a.unix - b.unix); // Oldest first for text
    const text = todayData.map(l => 
      `${format(fromUnixTime(l.unix), 'HH:mm')} ${l.exercise} Set${l.set} ${l.weight} x ${l.rep} (RIR ${l.feeling}) Rest: ${l.rest}`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => alert("已複製今日紀錄"));
  };
  /* ---<Helper Functions end>--- */

  /* ---<Render Helpers start>--- */
  // Group logs by Date
  const groupedLogs = useMemo(() => {
    const groups = {};
    logs.forEach(log => {
      const dateKey = format(fromUnixTime(log.unix), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  const visibleDays = 1 + 3 + (loadMoreCount * 5); // Today + 3 past + loaded
  /* ---<Render Helpers end>--- */

  return (
    <div className="min-h-screen pb-10 max-w-md mx-auto relative px-4">
      {/* Header */}
      <header className={`text-3xl font-bold py-6 text-center ${PRIMARY_COLOR} tracking-tighter`}>
        Gym Logger
      </header>

      {/* ---<Input Section start>--- */ }
      <div className="space-y-4 mb-8 bg-gray-900 p-4 rounded-2xl border border-gray-800">
        
        {/* Output Preview Box */}
        <div className={`p-3 border rounded-lg bg-black font-mono text-sm min-h-[60px] flex items-center flex-wrap gap-2 ${BORDER_COLOR}`}>
           {form.adjs.map(a => <span key={a} className="text-gray-400">#{a}</span>)}
           {form.verbs.map(v => <span key={v} className="text-white font-bold">{v}</span>)}
           <span className={PRIMARY_COLOR}>
             {form.weightOrTime}{form.isTime ? 's' : 'kg'} x {form.reps} (RIR{form.rir})
           </span>
           {form.rest && <span className="text-xs text-gray-500">Rest {form.rest}s</span>}
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-3 gap-2">
            <div className="relative col-span-1">
                <input 
                  type="number" 
                  value={form.weightOrTime}
                  onChange={e => setForm({...form, weightOrTime: e.target.value})}
                  placeholder={form.isTime ? "秒數" : "重量"}
                  className="w-full bg-gray-800 rounded p-2 text-center text-white focus:outline-none focus:ring-1 focus:ring-yellow-400"
                />
                <button 
                  onClick={() => setForm({...form, isTime: !form.isTime})}
                  className="absolute right-1 top-2 text-xs text-yellow-500 font-bold"
                >
                    {form.isTime ? 'SEC' : 'KG'}
                </button>
            </div>
            <input 
                type="number" 
                value={form.reps}
                onChange={e => setForm({...form, reps: e.target.value})}
                placeholder="次數"
                className="col-span-1 bg-gray-800 rounded p-2 text-center text-white focus:outline-none focus:ring-1 focus:ring-yellow-400"
            />
            <input 
                type="number" 
                value={form.rir}
                onChange={e => setForm({...form, rir: e.target.value})}
                placeholder="RIR"
                className="col-span-1 bg-gray-800 rounded p-2 text-center text-white focus:outline-none focus:ring-1 focus:ring-yellow-400"
            />
        </div>

        {/* Rest Time */}
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Rest:</span>
            <input 
                type="number"
                value={form.rest}
                onChange={e => setForm({...form, rest: e.target.value})}
                placeholder="秒"
                className="w-20 bg-gray-800 rounded p-1 text-center text-white text-sm"
            />
            {[90, 120, 180].map(t => (
                <button 
                    key={t}
                    onClick={() => setForm({...form, rest: t})}
                    className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300"
                >
                    {t}s
                </button>
            ))}
        </div>

        {/* Shortcuts - Adjs */}
        <div className="flex flex-wrap gap-2">
            {menu.adjs.map(item => (
                <button 
                    key={item}
                    onClick={() => toggleSelection(form.adjs, item, 'adjs')}
                    className={`px-3 py-1 rounded-full text-xs transition-colors ${form.adjs.includes(item) ? 'bg-gray-600 text-white' : 'bg-black text-gray-500 border border-gray-800'}`}
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
                    className={`px-3 py-1 rounded-full text-sm font-bold transition-colors ${form.verbs.includes(item) ? BG_BUTTON : 'bg-gray-800 text-gray-300'}`}
                >
                    {item}
                </button>
            ))}
        </div>

        <button 
            onClick={handleSave}
            className={`w-full py-3 rounded-lg font-bold text-lg ${BG_BUTTON} active:scale-95 transition-transform`}
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
                    <div className="flex justify-between items-center mb-2">
                        <h3 className={`font-bold ${isToday ? 'text-xl text-white' : 'text-md text-gray-500'}`}>
                            {format(parseISO(date), 'MM-dd')} {isToday && '(Today)'}
                        </h3>
                        {isToday && (
                            <button onClick={copyTodayLogs} className="text-xs text-yellow-500 border border-yellow-500 px-2 py-1 rounded">
                                複製
                            </button>
                        )}
                    </div>
                    
                    {/* Collapsible Logic: Today always open, others collapsed logic could be added here, but requirement says "Accordion for non-today" */}
                    <details open={isToday || idx < 3} className="group">
                        <summary className="list-none cursor-pointer text-gray-600 text-center text-sm py-1 group-open:hidden">
                             V 展開詳細 ({dayLogs.length})
                        </summary>
                        <div className="space-y-2 mt-2">
                            {dayLogs.map((log) => (
                                <div 
                                    key={log.id} 
                                    className={`grid grid-cols-12 gap-1 text-sm items-center p-2 rounded ${isToday ? 'bg-gray-900' : 'bg-gray-950 opacity-70'}`}
                                >
                                    <div className="col-span-2 text-xs text-gray-500">
                                        {format(fromUnixTime(log.unix), 'HH:mm')}
                                    </div>
                                    <div className="col-span-5 font-bold text-white truncate">
                                        {log.exercise} <span className="text-xs text-gray-400">#{log.set}</span>
                                    </div>
                                    <div className="col-span-5 text-right flex justify-end gap-2 text-gray-300">
                                        <span>{log.weight}</span>
                                        <span>x{log.rep}</span>
                                        <span className={PRIMARY_COLOR}>@{log.feeling}</span>
                                    </div>
                                    {/* Editable Fields Expansion could go here on click */}
                                    {log.rest && <div className="col-span-12 text-xs text-right text-gray-600 border-t border-gray-800 mt-1 pt-1">
                                        Rest: {log.rest}s
                                    </div>}
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            )
        })}
        
        <button 
            onClick={() => setLoadMoreCount(c => c + 1)}
            className="w-full py-2 text-gray-500 text-sm hover:text-white"
        >
            [載入更多]
        </button>
      </div>
      {/* ---<Log Table Section end>--- */}

      {/* ---<Contribution Graph start>--- */}
      <div className="mt-10 mb-6">
          <h4 className="text-xs text-gray-500 mb-2">Consistency</h4>
          <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-2 justify-end">
              {Array.from({ length: 90 }).map((_, i) => {
                  const day = subDays(new Date(), 89 - i);
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const count = groupedLogs.find(g => g[0] === dayStr)?.[1].length || 0;
                  // Color scale
                  let bg = 'bg-gray-800';
                  if (count > 0) bg = 'bg-yellow-900';
                  if (count > 3) bg = 'bg-yellow-700';
                  if (count > 6) bg = 'bg-yellow-500';
                  if (count > 10) bg = 'bg-yellow-300';
                  
                  return (
                    <div key={i} className={`w-2 h-2 rounded-sm flex-shrink-0 ${bg}`} title={`${dayStr}: ${count}`} />
                  )
              })}
          </div>
      </div>
      {/* ---<Contribution Graph end>--- */}

      <footer className="text-center text-xs text-gray-700 py-4">
          designed by sphsieh 2025
      </footer>
    </div>
  );
}

export default App;