// ============================================================
// sections/mvp-dashboard.js — v6.5 (분석 근거 및 옵션 A 강화)
// ============================================================

var REST_API_KEY = '3a6251b3b44aa4f72388859b4771cf4a';

window.MVPDashboard = function MVPDashboard() {

  /* ── 1. 유틸리티 (10분 단위 올림 로직) ── */
  var pad = (n) => String(n).padStart(2, '0');
  var hours = Array.from({ length: 24 }, (_, i) => pad(i));
  var minutes = ['00', '10', '20', '30', '40', '50'];
  var statusOptions = ['섭외 논의 중', '진행 예정', '진행 완료', '정산 대기', '입금 완료', '보류/취소'];

  function toMin(t) { if (!t) return 0; var p = t.split(':'); return parseInt(p[0] || 0, 10) * 60 + parseInt(p[1] || 0, 10); }
  function fmtTime(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function roundTo10(m) { return Math.ceil(m / 10) * 10; }

  function fmtDate(iso) {
    if (!iso || iso.length < 10) return iso; 
    var parts = iso.split('-');
    var dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return iso + '(' + days[dt.getDay()] + ')';
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function getKakaoTimeStr(d, t, m) {
    var dt = new Date(d + 'T' + t + ':00');
    dt.setMinutes(dt.getMinutes() + m);
    return "" + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + pad(dt.getHours()) + pad(dt.getMinutes());
  }

  /* ── 2. 상태 관리 ── */
  var [mgmtView, setMgmtView] = React.useState('calendar'); 
  var [selectedDate, setSelectedDate] = React.useState('2026-04-15');
  var [currentMonth, setCurrentMonth] = React.useState(new Date(2026, 3, 1)); 
  var [pickerMonth, setPickerMonth] = React.useState(new Date(2026, 3, 1)); 

    React.useEffect(function() {
      var handleReset = function() {
        // 💡 일정 조율 탭을 다시 눌렀을 때 캘린더로 돌아가고 폼을 비웁니다.
        setMgmtView('calendar'); 
        if (typeof resetAll === 'function') resetAll(); 
      };
      
      // 신호 수신 대기
      window.addEventListener('RESET_DASHBOARD', handleReset);
      
      // 컴포넌트가 사라질 때 리스너 삭제 (안전장치)
      return function() { 
        window.removeEventListener('RESET_DASHBOARD', handleReset); 
      };
    }, []); // 👈 처음 한 번만 실행되도록 설정

  var initialForm = {
    title: '', date: '', startTime: '09:00', endTime: '10:00', 
    institution: '', location: '', fee: '', contactName: '', 
    contactPhone: '', contactEmail: '', memo: '', status: '진행 예정', tags: ''
  };
  var [form, setForm] = React.useState(initialForm);
  var [lectures, setLectures] = React.useState([]);
  var [result, setResult] = React.useState(null);
  var [isAnalyzing, setIsAnalyzing] = React.useState(false);
  var [analysisError, setAnalysisError] = React.useState(null);
  var [editingLec, setEditingLec] = React.useState(null); 

  React.useEffect(() => {
    try { var stored = localStorage.getItem('kangbiseo_lectures'); if (stored) setLectures(JSON.parse(stored)); } catch (e) { }
  }, []);
  React.useEffect(() => { localStorage.setItem('kangbiseo_lectures', JSON.stringify(lectures)); }, [lectures]);

  function isDateFree(date) { return !lectures.some(l => l.date === date && l.status !== '보류/취소'); }
  function isFormValid() { return form.title.trim() && form.date && form.institution.trim() && form.location.trim(); }
  function handleFieldChange(f) { return (e) => setForm(prev => ({...prev, [f]: e.target.value})); }
  
  function handleTimeChange(type, part, value) {
    setForm(prev => {
      var next = Object.assign({}, prev);
      var parts = prev[type].split(':');
      var h = parts[0], m = parts[1];
      if (part === 'h') h = value; else m = value;
      next[type] = h + ':' + m;
      if (type === 'startTime' && toMin(next.startTime) >= toMin(next.endTime)) {
        var autoEnd = toMin(next.startTime) + 60;
        next.endTime = fmtTime(autoEnd >= 1440 ? 1439 : autoEnd);
      }
      return next;
    });
  }

  /* ── 3. 분석 엔진 (근거 제시 로직 강화) ── */
  function geocodeAddress(addr) {
    return fetch('https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(addr), { headers: { Authorization: 'KakaoAK ' + REST_API_KEY } })
      .then(r => r.json()).then(d => {
        if(!d.documents[0]) throw new Error("주소를 찾을 수 없습니다.");
        return { lng: parseFloat(d.documents[0].x), lat: parseFloat(d.documents[0].y) };
      });
  }

  function getTravelTime(c1, c2, dep) {
    return fetch('https://apis-navi.kakaomobility.com/v1/future/directions?origin='+c1.lng+','+c1.lat+'&destination='+c2.lng+','+c2.lat+'&departure_time='+dep+'&priority=RECOMMEND', { headers: { Authorization: 'KakaoAK ' + REST_API_KEY } })
      .then(r => r.json()).then(d => d.routes[0].summary.duration / 60);
  }

  // 💡 [교체 1] 완벽한 시간 교집합 계산이 포함된 분석 엔진
  function analyzeSchedule() {
    setResult(null); setAnalysisError(null); setIsAnalyzing(true); setMgmtView('review');

    const newL = Object.assign({ id: editingLec ? editingLec.id : Date.now() }, form);
    const newStart = toMin(newL.startTime);
    const newEnd = toMin(newL.endTime);
    const duration = newEnd - newStart; // 새 강의의 진행 시간

    // 1. 같은 날짜의 "보류/취소"가 아닌 모든 기존 일정 가져오기
    const sameDay = lectures.filter(l => 
      l.date === newL.date && l.id !== newL.id && l.status !== '보류/취소'
    );

    const optB = { prevD: addDays(newL.date, -1), nextD: addDays(newL.date, 1), prevFree: isDateFree(addDays(newL.date, -1)), nextFree: isDateFree(addDays(newL.date, 1)) };
    const optC = { prevW: addDays(newL.date, -7), nextW: addDays(newL.date, 7), prevWFree: isDateFree(addDays(newL.date, -7)), nextWFree: isDateFree(addDays(newL.date, 7)) };

    // 2. 🚨 절대 뚫리지 않는 시간 중복 체크 공식
    const directConflict = sameDay.find(l => {
      const existStart = toMin(l.startTime);
      const existEnd = toMin(l.endTime);
      // 두 시간대 중 '늦게 시작한 시간'이 '일찍 끝난 시간'보다 작으면 무조건 겹칩니다.
      return Math.max(existStart, newStart) < Math.min(existEnd, newEnd);
    });

    if (directConflict) {
        // 💡 [수정] 당일 빈 시간대 찾기 (정리 30분 + 이동 60분 + 세팅 30분 = 총 120분 여유 확보)
        let sortedSame = [...sameDay].sort((a,b) => toMin(a.startTime) - toMin(b.startTime));
        let sugStartMin = null;
        let checkStart = 540; // 오전 9시(540분)부터 탐색 시작

        for(let lec of sortedSame) {
          let lStart = toMin(lec.startTime);
          let lEnd = toMin(lec.endTime);
          
          // 1. 현재 탐색 시간(checkStart)부터 다음 강의 시작(lStart) 사이에 
          // [새 강의 시간] + [새 강의 정리(30) + 이동(60) + 기존 강의 세팅(30) = 120분]이 확보되는지 확인
          if (lStart - checkStart >= duration + 120) {
            sugStartMin = roundTo10(checkStart); 
            break;
          }
          
          // 2. 중간에 충분한 틈이 없다면, 기존 강의 종료(lEnd) 시점으로부터 
          // [기존 강의 정리(30) + 이동(60) + 새 강의 세팅(30) = 120분]을 더한 시간을 다음 탐색 시작점으로 설정
          checkStart = Math.max(checkStart, lEnd + 120); 
        }
        
        // 3. 중간에 빈틈이 없으면, 맨 마지막 강의가 끝난 후 120분 뒤를 제안 
        // (단, 강의가 밤 10시(1320분) 이내에 끝난다는 조건)
        if (!sugStartMin && checkStart + duration <= 1320) {
          sugStartMin = roundTo10(checkStart);
        }

        let optA = sugStartMin ? { sugStart: fmtTime(sugStartMin), sugEnd: fmtTime(sugStartMin + duration) } : null;

        setResult({
          hasConflict: true,
          isDirectOverlap: true, // 🚩 이 값이 true여야 대조 화면이 뜹니다!
          conflictingLec: directConflict,
          newL: newL,
          options: { a: optA, b: optB, c: optC }
        });
        
        setAnalysisError("해당 시간에 이미 다른 강의가 예정되어 있습니다.");
        setIsAnalyzing(false);
        return; // 동선 계산(API) 안 하고 즉시 종료
      }

    // 일정이 없을 경우 즉시 결과 반환
    if (!sameDay.length) {
      setTimeout(() => { setResult({ hasConflict: false, newL, travelData: [], options: { a: null, b: optB, c: optC } }); setIsAnalyzing(false); }, 600);
      return;
    }

    // 3. 중복이 없을 경우에만 API 호출하여 동선 계산 (기존과 동일)
    const timeline = sameDay.concat([newL]).sort((a,b)=>toMin(a.startTime)-toMin(b.startTime));
    Promise.all(timeline.map(l => geocodeAddress(l.location))).then(geos => {
      const pairs = []; for (let i=0; i<timeline.length-1; i++) pairs.push([timeline[i], timeline[i+1]]);
      return Promise.all(pairs.map(p => getTravelTime(geos[timeline.indexOf(p[0])], geos[timeline.indexOf(p[1])], getKakaoTimeStr(p[0].date, p[0].endTime, 30))))
        .then(mins => {
          const tData = pairs.map((p, i) => {
            const avail = toMin(p[1].startTime) - toMin(p[0].endTime);
            const req = Math.ceil(mins[i]) + 60;
            return { l1: p[0], l2: p[1], travelMin: Math.ceil(mins[i]), isSafe: avail >= req, available: avail, required: req, depTime: fmtTime(toMin(p[0].endTime) + 30) };
          });
          
          const curIdx = timeline.findIndex(l => l.id === newL.id);
          let sug = null; 
          if (curIdx > 0) {
            const pre = timeline[curIdx-1];
            const arrivalTime = toMin(pre.endTime) + 30 + Math.ceil(mins[curIdx-1]) + 30;
            const roundedStart = roundTo10(arrivalTime);
            sug = { sugStart: fmtTime(roundedStart), sugEnd: fmtTime(roundedStart + duration) };
          }
          setResult({ hasConflict: tData.some(d => !d.isSafe), newL, travelData: tData, dangerData: tData.filter(d => !d.isSafe), options: { a: sug, b: optB, c: optC } });
        });
    }).catch(e => { console.error(e); setAnalysisError("분석 중 에러가 발생했습니다."); }).finally(() => setIsAnalyzing(false));
  }

  function saveLecture() {
    var final = result.newL;
    setLectures(prev => prev.some(l => l.id === final.id) ? prev.map(l => l.id === final.id ? final : l) : prev.concat([final]));
    resetAll(); setMgmtView('calendar');
  }

  function saveAsPending() {
    var final = Object.assign({}, result.newL, { status: '보류/취소' });
    setLectures(prev => prev.some(l => l.id === final.id) ? prev.map(l => l.id === final.id ? final : l) : prev.concat([final]));
    resetAll(); setMgmtView('calendar');
  }

  function deleteLecture() { if (confirm("삭제할까요?")) { setLectures(prev => prev.filter(l => l.id !== editingLec.id)); resetAll(); setMgmtView('calendar'); } }
  function resetAll() { setForm(initialForm); setResult(null); setAnalysisError(null); setEditingLec(null); }

  /* ── 4. UI 렌더링 ── */
  var cardS = 'bg-white border border-slate-200 rounded-[2.5rem] shadow-xl shadow-slate-200/50';
  var inputS = 'w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xl text-slate-900 focus:border-blue-500 focus:bg-white outline-none';
  var labelS = 'text-slate-500 text-xl font-bold mb-2 ml-2 flex items-center';
  var reqStar = <span className="text-red-500 ml-1">*</span>;

  function MiniCalendar({ targetDate, onSelect, activeDate }) {
  var year = targetDate.getFullYear();
  var month = targetDate.getMonth();
  
  // 첫 날 요일과 마지막 날짜 계산
  var firstDay = new Date(year, month, 1).getDay();
  var lastDate = new Date(year, month + 1, 0).getDate();
  
  var days = [];
  for (var i = 0; i < firstDay; i++) days.push(null); // 빈 칸
  for (var d = 1; d <= lastDate; d++) days.push(d); // 날짜
  
  return (
    <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
      <p className="text-center text-xs font-black text-blue-800 mb-2">{month + 1}월</p>
      <div className="grid grid-cols-7 gap-1">
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className="text-[10px] text-center text-slate-400 font-bold">{d}</div>
        ))}
        {days.map((day, idx) => {
          var dStr = day ? year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0') : null;
          var isSel = dStr === activeDate;
          
          return (
            <div 
              key={idx} 
              onClick={() => day && onSelect(dStr)}
              className={'h-7 flex items-center justify-center text-xs rounded-lg cursor-pointer transition-all ' + 
                (day ? (isSel ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-blue-50') : '')}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

  return (
    <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {/* 💡 [수정] 달력 뷰: 크기 축소 및 폰트 슬림화 적용 */}
          {mgmtView === 'calendar' && (
            <div className="animate-fadeIn p-2 max-w-5xl mx-auto"> {/* 전체 가로폭 제한 및 패딩 축소 */}
              {/* 달력 헤더: 크기 축소 */}
              <div className="flex justify-between items-center mb-5 px-2">
                <h2 className="text-2xl font-bold text-blue-800">
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-blue-600 shadow-sm hover:bg-slate-50">◀</button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-blue-600 shadow-sm hover:bg-slate-50">▶</button>
                </div>
              </div>

              {/* 달력 그리드: 곡률 조절 및 간결화 */}
              <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-[1.5rem] overflow-hidden shadow-xl">
                {/* 요일 헤더: 텍스트 크기 및 패딩 축소 */}
                {['일','월','화','수','목','금','토'].map(d => (
                  <div key={d} className="bg-slate-50 p-2.5 text-center text-xs text-slate-400 font-bold">{d}</div>
                ))}

                {/* 빈 칸 처리 */}
                {Array.from({length: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()}).map((_,i) => (
                  <div key={'e'+i} className="bg-slate-100/30"></div>
                ))}

                {/* 날짜 루프: 셀 높이 축소 */}
                {Array.from({length: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()}).map((_,i) => {
                  var d = i + 1;
                  var dStr = currentMonth.getFullYear() + '-' + String(currentMonth.getMonth() + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                  var dayLecs = lectures.filter(l => l.date === dStr).sort((a,b)=>toMin(a.startTime)-toMin(b.startTime));
                  
                  return (
                    <div 
                      key={d} 
                      onClick={() => { setSelectedDate(dStr); setMgmtView('dayDetail'); }} 
                      // 💡 셀 최소 높이를 150px -> 110px로 축소
                      className={'min-h-[110px] p-1.5 transition-all cursor-pointer ' + (dStr===selectedDate ? 'bg-blue-50' : 'bg-white hover:bg-slate-50')}
                    >
                      {/* 날짜 숫자: 크기 축소 (xl -> base), 굵기 축소 (black -> bold) */}
                      <div className={'text-base font-bold mb-1 ' + (dStr===selectedDate ? 'text-blue-600' : 'text-slate-300')}>
                        {d}
                      </div>

                      {/* 일정 리스트: 폰트 및 간격 최적화 */}
                      <div className="space-y-1">
                        {dayLecs.map(l => {
                          var statusBg = {
                            '섭외 논의 중': 'bg-orange-500',
                            '진행 예정': 'bg-blue-600',
                            '진행 완료': 'bg-emerald-600',
                            '입금 완료': 'bg-indigo-600',
                            '보류/취소': 'bg-slate-400'
                          };

                          return (
                            <div 
                              key={l.id} 
                              // 💡 내부 패딩 축소 및 곡률 조절
                              className={'text-white px-2 py-1.5 rounded-lg leading-tight shadow-sm whitespace-normal break-all ' + (statusBg[l.status] || 'bg-blue-600')}
                            >
                              <div className="flex flex-col">
                                {/* 💡 시작 시간: 굵기 축소 (bold -> semibold), 크기 축소 */}
                                <span className="text-[10px] font-semibold opacity-90">
                                  {l.startTime}
                                </span>
                                
                                {/* 💡 강의 제목: 굵기 축소 (semibold -> medium), 크기 축소 */}
                                <span className="text-[11px] font-medium leading-[1.2] block">
                                  {l.institution || l.title}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


        {/* [상세 뷰 - 생략(기존과 동일)] */}
        {mgmtView === 'dayDetail' && (
          <div className="animate-slideUp space-y-6 max-w-2xl mx-auto">
            <div className="flex justify-between items-center bg-blue-50 p-6 rounded-[2rem] border border-blue-100">
              <button onClick={() => setMgmtView('calendar')} className="text-blue-600 font-black text-xl">◀ 캘린더</button>
              <h3 className="font-black text-2xl text-blue-900">{fmtDate(selectedDate)}</h3>
              <button onClick={() => { setForm({...initialForm, date: selectedDate}); setMgmtView('form'); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-base shadow-lg shadow-blue-200">+ 추가</button>
            </div>
            {lectures.filter(l => l.date === selectedDate).length === 0 ? <p className="text-center py-24 text-slate-400 font-bold text-xl">일정이 없습니다.</p> : 
              lectures.filter(l => l.date === selectedDate).sort((a,b)=>toMin(a.startTime)-toMin(b.startTime)).map(lec => (
                
                <div key={lec.id} onClick={() => { setForm(lec); setEditingLec(lec); setMgmtView('form'); }} className={cardS + ' p-8 hover:border-blue-300 cursor-pointer'}>
                  <div className="flex justify-between items-start mb-4">
                    <span className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-md shadow-blue-100">
                      {lec.status}
                    </span>
                    {/* 💡 태그들을 배지 형태로 나열 */}
                    <div className="flex gap-1">
                      {lec.tags && lec.tags.split(',').map((t, idx) => (
                        <span key={idx} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-lg font-bold">
                          #{t.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-blue-600 font-black text-lg mb-2">🕒 {lec.startTime} ~ {lec.endTime}</div>
                  <div className="text-2xl font-black text-slate-900 mb-4">{lec.title || lec.institution}</div>
                  <div className="flex items-start gap-2 text-slate-500 font-bold text-base"><span>📍</span><span>{lec.location}</span></div>
                </div>
              ))
            }
          </div>
        )}

        {/* [폼 뷰 - 생략(기존과 동일)] */}
        {mgmtView === 'form' && (
          <div className="animate-slideUp max-w-xl mx-auto space-y-8 pb-10">
            <div className={cardS + ' p-10 space-y-8'}>
              <h2 className="text-3xl font-black text-blue-700">{editingLec ? '일정 수정' : '새 일정 입력'}</h2>
              <div className="space-y-6">
                <div><p className={labelS}>강의 명</p><input type="text" value={form.title} onChange={handleFieldChange('title')} className={inputS} placeholder="강의 제목" /></div>
                {/* 2. 강의 날짜 수정 (달력과 입력창 모두 form.date와 연동) */}
                <div>
                  <p className={labelS}>강의 날짜 선택{reqStar}</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <MiniCalendar 
                      targetDate={pickerMonth} 
                      onSelect={d => setForm({...form, date: d})} // 💡 선택 시 날짜 수정 반영
                      activeDate={form.date} 
                    />
                    <MiniCalendar 
                      targetDate={new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1)} 
                      onSelect={d => setForm({...form, date: d})} 
                      activeDate={form.date} 
                    />
                  </div>
                  {/* 💡 숫자로 직접 수정하거나 기본 달력 팝업 사용 */}
                  <input 
                    type="date" 
                    value={form.date} 
                    onChange={handleFieldChange('date')} 
                    className={inputS + ' py-3'} 
                  />
                </div>

<div className="grid grid-cols-2 gap-4">
                  <div><p className={labelS}>시작</p>
                    <div className="flex gap-2">
                      <select value={form.startTime.split(':')[0]} onChange={e => handleTimeChange('startTime','h',e.target.value)} className={inputS + ' py-3'}>{hours.map(h => <option key={h} value={h}>{h}시</option>)}</select>
                      <select value={form.startTime.split(':')[1]} onChange={e => handleTimeChange('startTime','m',e.target.value)} className={inputS + ' py-3'}>{minutes.map(m => <option key={m} value={m}>{m}분</option>)}</select>
                    </div>
                  </div>
                  <div><p className={labelS}>종료</p>
                    <div className="flex gap-2">
                      <select value={form.endTime.split(':')[0]} onChange={e => handleTimeChange('endTime','h',e.target.value)} className={inputS + ' py-3'}>{hours.filter(h=>h>=form.startTime.split(':')[0]).map(h => <option key={h} value={h}>{h}시</option>)}</select>
                      <select value={form.endTime.split(':')[1]} onChange={e => handleTimeChange('endTime','m',e.target.value)} className={inputS + ' py-3'}>{minutes.map(m => <option key={m} value={m}>{m}분</option>)}</select>
                    </div>
                  </div>
                </div>
                <div><p className={labelS}>강의 의뢰처</p><input type="text" value={form.institution} onChange={handleFieldChange('institution')} className={inputS} /></div>
                <div><p className={labelS}>장소 주소</p><input type="text" value={form.location} onChange={handleFieldChange('location')} className={inputS} /></div>
                <div><p className={labelS}>상태</p>
                  <div className="grid grid-cols-3 gap-2">
                    {statusOptions.map(opt => (
                      <button key={opt} onClick={() => setForm({...form, status: opt})} className={'py-4 rounded-2xl text-sm font-black border ' + (form.status === opt ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white border-slate-200 text-slate-400')}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={labelS}>태그 (쉼표로 구분)</p>
                  <input 
                    type="text" 
                    value={form.tags} 
                    onChange={handleFieldChange('tags')} 
                    className={inputS} 
                    placeholder="예: 기업강의, 워크샵, 인문학" 
                  />
                </div>
              </div>
              <div className="pt-8 space-y-4">
                <button onClick={analyzeSchedule} disabled={!isFormValid()} className="w-full bg-blue-600 text-white py-6 rounded-[2.5rem] font-black text-2xl shadow-xl shadow-blue-200 disabled:opacity-30">🔍 일정 검토하기</button>
                <button onClick={() => setMgmtView('calendar')} className="w-full text-slate-400 font-bold text-lg">취소</button>
              </div>
            </div>
          </div>
        )}

        {/* [리뷰 뷰] 💡 6.5 버전의 핵심: 근거 제시 및 옵션 A 고도화 */}
        {mgmtView === 'review' && (
          <div className="animate-slideUp max-w-xl mx-auto space-y-6 mt-10 px-4 pb-20">
            {isAnalyzing ? (
              <div className="p-32 text-center font-black text-2xl text-blue-600 animate-pulse">AI 분석 중...</div>
            ) : (
              <>
                {/* 🚩 CASE 1: 시간 중복 발생 시 (API 호출 안 함) */}
                {result?.isDirectOverlap ? (
                  <div className="space-y-6">
                    <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border-4 border-red-100">
                      <div className="bg-red-600 p-8 text-center text-white">
                        <h3 className="font-black text-2xl italic tracking-tighter">TIME OVERLAP!</h3>
                        <p className="opacity-90 font-bold mt-1">{analysisError}</p>
                      </div>

                      <div className="p-8 space-y-8">
                        {/* 시간순 정렬 좌/우 대조 로직 */}
                        {(() => {
                          const isNewFirst = toMin(result.newL.startTime) <= toMin(result.conflictingLec.startTime);
                          const firstLec = isNewFirst ? result.newL : result.conflictingLec;
                          const secondLec = isNewFirst ? result.conflictingLec : result.newL;
                          
                          return (
                            <div className="grid grid-cols-2 gap-4 relative">
                              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center border-4 border-white z-10 shadow-sm">
                                <span className="text-red-600 font-black text-[10px]">VS</span>
                              </div>
                              
                              {/* 좌측: 시간상 먼저 시작하는 일정 */}
                              <div className={'p-5 rounded-3xl border ' + (firstLec.id === result.newL.id ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100')}>
                                <p className={'text-[10px] font-black mb-2 uppercase ' + (firstLec.id === result.newL.id ? 'text-red-400' : 'text-slate-400')}>
                                  {firstLec.id === result.newL.id ? '입력 중인 새 일정' : '기존 확정 일정'}
                                </p>
                                <p className="text-slate-900 font-black text-sm mb-1 truncate">{firstLec.institution || firstLec.title}</p>
                                <p className="text-red-600 font-black text-lg">{firstLec.startTime}</p>
                                <p className="text-slate-400 text-[11px] font-bold">~ {firstLec.endTime}</p>
                                <p className="text-slate-500 text-[11px] mt-2 truncate">📍 {firstLec.location}</p>
                              </div>

                              {/* 우측: 시간상 나중에 시작하는 일정 */}
                              <div className={'p-5 rounded-3xl border ' + (secondLec.id === result.newL.id ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100')}>
                                <p className={'text-[10px] font-black mb-2 uppercase ' + (secondLec.id === result.newL.id ? 'text-red-400' : 'text-slate-400')}>
                                  {secondLec.id === result.newL.id ? '입력 중인 새 일정' : '기존 확정 일정'}
                                </p>
                                <p className="text-slate-900 font-black text-sm mb-1 truncate">{secondLec.institution || secondLec.title}</p>
                                <p className="text-red-600 font-black text-lg">{secondLec.startTime}</p>
                                <p className="text-slate-400 text-[11px] font-bold">~ {secondLec.endTime}</p>
                                <p className="text-slate-500 text-[11px] mt-2 truncate">📍 {secondLec.location}</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 💡 대안 제안 카드 (당일 추천 시간 + 전후 날짜) */}
                      <div className={cardS + ' p-8 space-y-6'}>
                        <p className="text-blue-800 text-sm font-black uppercase tracking-widest">💡 강비서의 시간 조정 제안</p>
                        <div className="space-y-4">
                          {result.options?.a ? (
                            <button 
                              onClick={() => { 
                                setForm({...result.newL, startTime: result.options.a.sugStart, endTime: result.options.a.sugEnd}); 
                                setMgmtView('form'); // 👈 클릭 시 폼 화면으로 이동!
                              }} 
                              className="w-full text-left p-6 rounded-3xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 transition-all"
                            >
                              <p className="text-blue-600 text-[11px] font-black mb-1">옵션 A: 당일 빈 시간대로 변경</p>
                              <p className="text-slate-900 text-lg font-black">{result.options.a.sugStart} ~ {result.options.a.sugEnd} <span className="text-xs font-bold text-slate-500 ml-1">(강의 {toMin(result.newL.endTime)-toMin(result.newL.startTime)}분 반영)</span></p>
                            </button>
                          ) : (
                            <div className="p-5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                              <p className="text-slate-400 text-xs font-bold">당일에는 더 이상 진행할 수 있는 여유 시간이 없습니다.</p>
                            </div>
                          )}
                          
                          {/* 옵션 B: 날짜 변경 */}
                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              onClick={() => { 
                                if(result.options.b.prevFree){ 
                                  setForm({...result.newL, date: result.options.b.prevD}); 
                                  setMgmtView('form'); // 👈 클릭 시 폼 화면으로 이동!
                                } 
                              }} 
                              disabled={!result.options.b.prevFree} 
                              className={'p-4 rounded-3xl border text-left ' + (result.options.b.prevFree ? 'border-emerald-100 bg-emerald-50/50' : 'opacity-20')}
                            >
                              <p className="text-emerald-600 text-[11px] font-black">전날로 변경</p>
                              <p className="text-slate-900 text-sm font-black mt-1">{fmtDate(result.options.b.prevD)}</p>
                            </button>
                            <button 
                              onClick={() => { 
                                if(result.options.b.nextFree){ 
                                  setForm({...result.newL, date: result.options.b.nextD}); 
                                  setMgmtView('form'); // 👈 클릭 시 폼 화면으로 이동!
                                } 
                              }} 
                              disabled={!result.options.b.nextFree} 
                              className={'p-4 rounded-3xl border text-left ' + (result.options.b.nextFree ? 'border-emerald-100 bg-emerald-50/50' : 'opacity-20')}
                            >
                              <p className="text-emerald-600 text-[11px] font-black">다음날로 변경</p>
                              <p className="text-slate-900 text-sm font-black mt-1">{fmtDate(result.options.b.nextD)}</p>
                            </button>
                          </div>
                        </div>
                      </div>

                    {/* 💡 하단 액션 버튼 (임시 보류 / 수정) */}
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => { 
                          const pendingLec = { ...result.newL, status: '보류/취소' }; 
                          setLectures(prev => prev.some(l => l.id === pendingLec.id) ? prev.map(l => l.id === pendingLec.id ? pendingLec : l) : prev.concat([pendingLec])); 
                          resetAll(); setMgmtView('calendar'); 
                        }} 
                        className="w-full bg-orange-100 text-orange-700 border border-orange-200 py-5 rounded-[2rem] font-black text-xl hover:bg-orange-200 transition-colors"
                      >
                        보류 상태로 임시 저장
                      </button>
                      <button 
                        onClick={() => setMgmtView('form')} 
                        className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-xl shadow-xl hover:bg-black transition-colors"
                      >
                        ← 시간 다시 수정하기
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 🚩 CASE 2: 시간 중복이 없을 때 나오는 동선 리포트 (기존 유지) */
                  result && !result.isDirectOverlap && (
                    <div className="space-y-6">
                      <div className={cardS + ' p-10 text-center border-4 ' + (result.hasConflict ? 'border-red-100' : 'border-emerald-100')}>
                        <h2 className={'font-black text-4xl mb-6 ' + (result.hasConflict ? 'text-red-500' : 'text-emerald-500')}>
                          {result.hasConflict ? '⚠️ 지각 위험' : '✅ 수락 가능'}
                        </h2>
                        
                        {/* 1) 지각 위험 근거 (동선 리포트 + 좌우 대조) */}
                        {result.hasConflict && result.dangerData && result.dangerData.length > 0 && (
                          <div className="mb-8 p-8 bg-red-50 border border-red-100 rounded-[2.5rem] text-left">
                            <p className="text-red-700 font-black text-lg mb-5 flex items-center gap-2">
                              <span>🚨</span> 지각 위험 근거 (동선 리포트)
                            </p>
                            <div className="space-y-8">
                              {result.dangerData.map((d, i) => (
                                <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-red-100">
                                  {/* 상단 날짜 표시 */}
                                  <div className="text-center font-black text-lg text-slate-700 mb-5 pb-3 border-b border-slate-100">
                                    📅 {fmtDate(d.l1.date)}
                                  </div>

                                  {/* 좌/우 대조 (VS) - 지각 원인이 되는 두 일정 비교 */}
                                  <div className="grid grid-cols-2 gap-4 relative mb-6">
                                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center border-2 border-white z-10 shadow-sm">
                                      <span className="text-red-600 font-black text-[10px]">VS</span>
                                    </div>
                                    
                                    {/* 좌측 일정 */}
                                    <div className={'p-4 rounded-2xl border ' + (d.l1.id === result.newL.id ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100')}>
                                      <p className="text-[10px] font-black mb-1 text-slate-400 uppercase">
                                        {d.l1.id === result.newL.id ? '입력 중인 새 일정' : '기존 확정 일정'}
                                      </p>
                                      <p className="text-slate-900 font-black text-sm mb-1 truncate">{d.l1.institution || d.l1.title}</p>
                                      <p className="text-blue-600 font-black text-sm">{d.l1.startTime} ~ {d.l1.endTime}</p>
                                      <p className="text-slate-500 text-[10px] mt-1 truncate">📍 {d.l1.location}</p>
                                    </div>

                                    {/* 우측 일정 */}
                                    <div className={'p-4 rounded-2xl border ' + (d.l2.id === result.newL.id ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100')}>
                                      <p className="text-[10px] font-black mb-1 text-slate-400 uppercase">
                                        {d.l2.id === result.newL.id ? '입력 중인 새 일정' : '기존 확정 일정'}
                                      </p>
                                      <p className="text-slate-900 font-black text-sm mb-1 truncate">{d.l2.institution || d.l2.title}</p>
                                      <p className="text-blue-600 font-black text-sm">{d.l2.startTime} ~ {d.l2.endTime}</p>
                                      <p className="text-slate-500 text-[10px] mt-1 truncate">📍 {d.l2.location}</p>
                                    </div>
                                  </div>

                                  {/* 동선 리포트 상세 수치 */}
                                  <div className="space-y-3 text-slate-600 font-bold text-sm bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="flex justify-between items-center py-1.5 bg-blue-50/50 px-3 rounded-xl border border-blue-50">
                                      <span className="text-blue-700 text-xs">🛫 출발 예정 시간 (자차)</span>
                                      <span className="text-blue-700 font-black text-base">{d.depTime}</span>
                                    </div>
                                    <div className="flex justify-between px-1"><span>🧹 강의 정리 </span><span>30분</span></div>
                                    <div className="flex justify-between px-1"><span>🚚 예상 이동 시간</span><span>{d.travelMin}분</span></div>
                                    <div className="flex justify-between px-1"><span>⚙️ 강의 세팅 및 준비</span><span>30분</span></div>
                                    <div className="flex justify-between px-1"><span>🕞 실제 필요한 여유 시간</span><span>{d.required}분 필요</span></div>
                                    <div className="flex justify-between items-center mt-3 p-4 bg-red-50 rounded-2xl border border-red-100">
                                      <span>⏳ 확보된 실제 여유</span><span className="text-blue-600">{d.available}분</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-dashed px-1">
                                      <span className="text-red-700 font-black">🚩 최종 지연 예상</span>
                                      <span className="text-red-700 font-black text-xl">{d.required - d.available}분 부족</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 💡 [수정됨] 누락된 중괄호 { } 추가 */}
                        {!result.hasConflict && (
                          <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border border-emerald-100 mb-10 text-left animate-fadeIn">
                            <div className="flex justify-between items-start mb-4">
                              <p className="font-black text-2xl text-slate-900 leading-tight">
                                {result.newL.title || result.newL.institution}
                              </p>
                              <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-black">SAFE</span>
                            </div>
                            
                            <div className="space-y-2">
                              <p className="text-emerald-600 font-black text-xl flex items-center gap-2">
                                📅 {fmtDate(result.newL.date)}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 font-bold text-lg">
                                <span className="flex items-center gap-1.5">🕒 {result.newL.startTime} ~ {result.newL.endTime}</span>
                                <span className="text-slate-300 hidden sm:inline">|</span>
                                <span className="flex items-center gap-1.5 text-base opacity-80">📍 {result.newL.location}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 💡 [수정됨] 누락된 중괄호 { } 추가 */}
                        {result.hasConflict ? (
                          <div className="flex flex-col gap-3">
                            <button 
                              onClick={() => { 
                                const pendingLec = { ...result.newL, status: '보류/취소' }; 
                                setLectures(prev => prev.some(l => l.id === pendingLec.id) ? prev.map(l => l.id === pendingLec.id ? pendingLec : l) : prev.concat([pendingLec])); 
                                resetAll(); setMgmtView('calendar'); 
                              }} 
                              className="w-full bg-orange-100 text-orange-700 border border-orange-200 py-5 rounded-[2rem] font-black text-xl hover:bg-orange-200 transition-colors"
                            >
                              보류 상태로 임시 저장
                            </button>
                            <button onClick={() => setMgmtView('form')} className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-xl shadow-xl hover:bg-black transition-colors">
                              ← 시간 다시 수정하기
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <button onClick={saveLecture} className="flex-1 bg-blue-600 text-white py-6 rounded-[2rem] font-black text-2xl shadow-xl hover:bg-blue-700 transition-all active:scale-95">확정/저장</button>
                            <button onClick={() => setMgmtView('form')} className="flex-1 border border-slate-200 text-slate-400 py-6 rounded-[2rem] font-black text-2xl hover:bg-slate-50 transition-all active:scale-95">수정</button>
                          </div>
                        )}
                      </div>

                      {/* 대안 제안 카드 (지각 위험 시에만 노출) */}
                      {result.hasConflict && (
                        <div className={cardS + ' p-8 space-y-6'}>
                          <p className="text-blue-800 text-sm font-black uppercase tracking-widest">💡 강비서의 시간 조정 제안</p>
                          <div className="space-y-4">
                            {result.options?.a ? (
                              <button 
                                onClick={() => { setForm({...result.newL, startTime: result.options.a.sugStart, endTime: result.options.a.sugEnd}); setMgmtView('form'); }} 
                                className="w-full text-left p-6 rounded-3xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 transition-all"
                              >
                                <p className="text-blue-600 text-[11px] font-black mb-1">옵션 A: 추천 시간으로 변경</p>
                                <p className="text-slate-900 text-lg font-black">{result.options.a.sugStart} ~ {result.options.a.sugEnd} <span className="text-xs font-bold text-slate-500 ml-1">(여유 포함 10분 단위 올림)</span></p>
                              </button>
                            ) : (
                              <div className="p-5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                                <p className="text-slate-400 text-xs font-bold">당일에는 시간 조정이 어렵습니다. 날짜 변경을 확인해 보세요.</p>
                              </div>
                            )}
                            
                            <div className="grid grid-cols-2 gap-3">
                              <button onClick={() => { if(result.options.b.prevFree){ setForm({...result.newL, date: result.options.b.prevD}); setMgmtView('form'); } }} disabled={!result.options.b.prevFree} className={'p-4 rounded-3xl border text-left ' + (result.options.b.prevFree ? 'border-emerald-100 bg-emerald-50/50' : 'opacity-20')}>
                                <p className="text-emerald-600 text-[11px] font-black">전날로 변경</p>
                                <p className="text-slate-900 text-sm font-black mt-1">{fmtDate(result.options.b.prevD)}</p>
                              </button>
                              <button onClick={() => { if(result.options.b.nextFree){ setForm({...result.newL, date: result.options.b.nextD}); setMgmtView('form'); } }} disabled={!result.options.b.nextFree} className={'p-4 rounded-3xl border text-left ' + (result.options.b.nextFree ? 'border-emerald-100 bg-emerald-50/50' : 'opacity-20')}>
                                <p className="text-emerald-600 text-[11px] font-black">다음날로 변경</p>
                                <p className="text-slate-900 text-sm font-black mt-1">{fmtDate(result.options.b.nextD)}</p>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};