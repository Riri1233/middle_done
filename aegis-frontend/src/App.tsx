// ╔══════════════════════════════════════════════════════════════╗
// ║  AEGIS COMPLY — Frontend v2  (Enterprise Edition)           ║
// ╚══════════════════════════════════════════════════════════════╝
import React, { useState, useEffect, useRef, useCallback, type ReactNode, type ErrorInfo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, Tooltip,
} from 'recharts';
import {
  apiLogin, apiRegister, apiLogout, apiGetMe, apiListChecks, apiGetStats,
  apiCreateCheck, apiDeleteCheck, apiDownloadPDF, apiExportCSV,
  apiUpdateMe, apiListDocuments, apiUploadDocumentRaw, apiDeleteDocument,
  apiListMonitors, apiCreateMonitor, apiRecheckMonitor, apiMarkMonitorRead, apiDeleteMonitor,
  mapCheck, clearTokens, getAccessToken,
  apiListReviews, apiGetReviewStats, apiFlagCheck, apiDecideReview, apiDeleteReview,
  type ApiReview,
  type ApiDocument, type ApiMonitor,
} from './api';

const T = {
  bg:'#07080F',surf:'#0D0F1B',surf2:'#111422',surf3:'#161929',
  border:'#1A2030',borderStr:'#232D42',borderFocus:'#3B6EE8',
  text:'#E1E4EE',textDim:'#7B8BAE',textSub:'#4A5570',
  blue:'#4575F3',blueDim:'rgba(69,117,243,0.12)',
  green:'#22D47A',greenDim:'rgba(34,212,122,0.1)',
  amber:'#F5A623',amberDim:'rgba(245,166,35,0.12)',
  red:'#F04747',redDim:'rgba(240,71,71,0.1)',
  mono:"'JetBrains Mono',monospace",
};

const RISK:Record<string,{c:string;bg:string;label:string}> = {
  LOW:{c:T.green,bg:T.greenDim,label:'Низкий'},
  MEDIUM:{c:T.amber,bg:T.amberDim,label:'Средний'},
  HIGH:{c:T.red,bg:T.redDim,label:'Высокий'},
};
const VERDICT:Record<string,{c:string;bg:string;label:string;sub:string;icon:string;badge:string}> = {
  APPROVED:{
    c:T.green,bg:T.greenDim,icon:'✓',badge:'LOW RISK',
    // Risk-assessment language — NOT a legal determination
    label:'Рисков не выявлено',
    sub:'Сделка может быть рассмотрена к одобрению после проверки документации',
  },
  CAUTION:{
    c:T.amber,bg:T.amberDim,icon:'⚠',badge:'REVIEW',
    label:'Требуется дополнительная проверка',
    sub:'Выявлены индикаторы риска. Рекомендуется углублённый due diligence.',
  },
  BLOCKED:{
    c:T.red,bg:T.redDim,icon:'✕',badge:'HIGH RISK',
    label:'Высокий риск — рекомендован отказ',
    sub:'Серьёзные compliance-риски. Требуется заключение юриста перед принятием решения.',
  },
};
const REVIEW_STATUS: Record<string, { c: string; bg: string; label: string }> = {
  pending:   { c: T.amber, bg: T.amberDim, label: 'Ожидает проверки' },
  in_review: { c: T.blue,  bg: T.blueDim,  label: 'На рассмотрении' },
  approved:  { c: T.green, bg: T.greenDim, label: 'Одобрено' },
  escalated: { c: T.red,   bg: T.redDim,   label: 'Эскалировано' },
  rejected:  { c: T.red,   bg: T.redDim,   label: 'Отклонено' },
};
const REVIEW_PRIORITY: Record<string, { c: string; bg:string; label: string }> = {
  normal: { c: T.textDim, bg:T.surf2, label: 'Обычный' },
  high:   { c: T.amber, bg:T.amberDim,  label: 'Высокий' },
  urgent: { c: T.red, bg:T.redDim,    label: 'Срочно' },
};
const MODULE_LABELS:Record<string,string> = {
  sanctions:'Санкц. скрининг',exportControl:'Экспортный контроль',
  ubo:'UBO / Правило 50%',payment:'Платёжный коридор',route:'Маршрут / Антиобход',
};
const COUNTRIES = [
  {v:'CN',l:'🇨🇳 Китай'},{v:'TR',l:'🇹🇷 Турция'},{v:'AE',l:'🇦🇪 ОАЭ'},
  {v:'KZ',l:'🇰🇿 Казахстан'},{v:'AM',l:'🇦🇲 Армения'},{v:'GE',l:'🇬🇪 Грузия'},
  {v:'IN',l:'🇮🇳 Индия'},{v:'RS',l:'🇷🇸 Сербия'},{v:'HK',l:'🇭🇰 Гонконг'},
  {v:'DE',l:'🇩🇪 Германия'},{v:'US',l:'🇺🇸 США'},{v:'GB',l:'🇬🇧 UK'},
  {v:'TH',l:'🇹🇭 Таиланд'},{v:'VN',l:'🇻🇳 Вьетнам'},{v:'OTHER',l:'🌍 Другая'},
];
const CURRENCIES = [
  {v:'CNY',l:'CNY — Юань'},{v:'TRY',l:'TRY — Лира'},{v:'AED',l:'AED — Дирхам'},
  {v:'KZT',l:'KZT — Тенге'},{v:'INR',l:'INR — Рупия'},{v:'USD',l:'USD — Доллар'},
  {v:'EUR',l:'EUR — Евро'},{v:'RUB',l:'RUB — Рубль'},
];

// ── Shared utilities ─────────────────────────────────────────
// Single date formatter — consistent everywhere
const fmtDate  = (d: string) => new Date(d).toLocaleDateString('ru-RU');
const fmtDateTime = (d: string) => new Date(d).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
const fmtDateLong = (d: string) => new Date(d).toLocaleDateString('ru-RU', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
// Risk score → colour
const riskColor = (s: number) => s < 30 ? T.green : s < 60 ? T.amber : T.red;
// useInterval hook — for document polling
function useInterval(fn: () => void, delay: number | null) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => ref.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
// Responsive breakpoints
function useWindowWidth() {
  const [w, setW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}
// Shared error message component
function ErrMsg({ msg, style = {} }: any) {
  if (!msg) return null;
  return (
    <div style={{ color: T.red, background: T.redDim, border: `1px solid ${T.red}`,
      borderRadius: 6, padding: '9px 12px', fontSize: 12, lineHeight: 1.5, ...style }}>
      {msg}
    </div>
  );
}

// ── Primitives ─────────────────────────────────────────────────

const css = (...objs:any[]) => Object.assign({},...objs.filter(Boolean));

function Btn({children,onClick,variant='primary',size='md',disabled=false,style={}}:any){
  const sz:any={sm:{padding:'5px 12px',fontSize:12},md:{padding:'8px 16px',fontSize:13},lg:{padding:'11px 24px',fontSize:14}};
  const vr:any={
    primary:{background:T.blue,color:'#fff',border:'none'},
    secondary:{background:T.surf2,color:T.text,border:`1px solid ${T.border}`},
    ghost:{background:'transparent',color:T.textDim,border:`1px solid ${T.border}`},
    danger:{background:T.redDim,color:T.red,border:`1px solid ${T.red}`},
    success:{background:T.greenDim,color:T.green,border:`1px solid ${T.green}`},
  };
  return(
    <button disabled={disabled} onClick={onClick}
      style={css({borderRadius:7,fontWeight:600,cursor:disabled?'not-allowed':'pointer',
        opacity:disabled?0.5:1,display:'inline-flex',alignItems:'center',gap:6,
        fontFamily:"'Outfit',sans-serif"},sz[size],vr[variant],style)}>
      {children}
    </button>
  );
}

function Card({children,style={},onClick}:any){
  return(
    <div onClick={onClick}
      style={css({background:T.surf,border:`1px solid ${T.border}`,borderRadius:10},
        style,onClick&&{cursor:'pointer'})}>
      {children}
    </div>
  );
}

function Badge({level}:any){
  const r=RISK[level]??{c:T.textDim,bg:T.surf2,label:level??'—'};
  return <span style={{background:r.bg,color:r.c,padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,fontFamily:T.mono}}>{r.label}</span>;
}

function VerdictBadge({verdict}:any){
  const v=VERDICT[verdict]??VERDICT.CAUTION;
  return(
    <span style={{background:v.bg,color:v.c,padding:'2px 9px',borderRadius:20,
      fontSize:11,fontWeight:700,fontFamily:"'Outfit',sans-serif",letterSpacing:'0.2px'}}>
      {v.icon} {v.badge}
    </span>
  );
}

function Inp({label,value,onChange,placeholder,type='text',hint='',disabled=false}:any){
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:'block',marginBottom:5,color:T.textDim,fontSize:12,fontWeight:500}}>{label}</label>}
      <input disabled={disabled} type={type} value={value}
        onChange={(e:any)=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={(e:any)=>{ e.target.style.borderColor=T.borderFocus; e.target.style.boxShadow=`0 0 0 3px rgba(69,117,243,0.12)`; }}
        onBlur={(e:any)=>{ e.target.style.borderColor=T.border; e.target.style.boxShadow='none'; }}
        style={{width:'100%',background:T.surf2,border:`1px solid ${T.border}`,borderRadius:7,
          padding:'9px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box',
          opacity:disabled?0.6:1,transition:'border-color 0.15s,box-shadow 0.15s'}}/>
      {hint&&<div style={{fontSize:11,color:T.textSub,marginTop:4}}>{hint}</div>}
    </div>
  );
}

function Sel({label,value,onChange,options}:any){
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:'block',marginBottom:5,color:T.textDim,fontSize:12,fontWeight:500}}>{label}</label>}
      <select value={value} onChange={(e:any)=>onChange(e.target.value)}
        onFocus={(e:any)=>{ e.target.style.borderColor=T.borderFocus; e.target.style.boxShadow=`0 0 0 3px rgba(69,117,243,0.12)`; }}
        onBlur={(e:any)=>{ e.target.style.borderColor=T.border; e.target.style.boxShadow='none'; }}
        style={{width:'100%',background:T.surf2,border:`1px solid ${T.border}`,borderRadius:7,
          padding:'9px 12px',color:value?T.text:T.textSub,fontSize:13,outline:'none',
          boxSizing:'border-box',transition:'border-color 0.15s,box-shadow 0.15s'}}>
        <option value="">Выберите...</option>
        {options.map((o:any)=><option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function ScoreBar({score,color}:any){
  return(
    <div style={{height:4,background:T.border,borderRadius:2,overflow:'hidden',margin:'6px 0'}}>
      <div style={{height:'100%',width:`${Math.min(100,score??0)}%`,background:color,borderRadius:2}}/>
    </div>
  );
}

function ScoreGauge({score}:any){
  const c=score<30?T.green:score<60?T.amber:T.red;
  const r=30,circ=2*Math.PI*r,dash=circ*score/100;
  return(
    <svg width={80} height={80} viewBox="0 0 80 80">
      <circle cx={40} cy={40} r={r} fill="none" stroke={T.border} strokeWidth={6}/>
      <circle cx={40} cy={40} r={r} fill="none" stroke={c} strokeWidth={6}
        strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={circ/4} strokeLinecap="round"/>
      <text x={40} y={43} textAnchor="middle" fill={c} fontSize={18} fontWeight={700} fontFamily="Outfit">{score}</text>
      <text x={40} y={57} textAnchor="middle" fill={T.textSub} fontSize={9} fontFamily="Outfit">РИСК</text>
    </svg>
  );
}

function Toasts({toasts}:any){
  return(
    <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:8}}>
      {toasts.map((t:any)=>(
        <div key={t.id} style={{
          background:t.type==='error'?T.redDim:t.type==='info'?T.blueDim:T.greenDim,
          border:`1px solid ${t.type==='error'?T.red:t.type==='info'?T.blue:T.green}`,
          color:t.type==='error'?T.red:t.type==='info'?T.blue:T.green,
          padding:'10px 16px',borderRadius:8,fontSize:13,fontWeight:600,maxWidth:320}}>
          {t.type==='error'?'✕':t.type==='info'?'ℹ':'✓'} {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Error Boundary ───────────────────────────────────────────
interface EBState { error: Error | null; }
class ErrorBoundary extends React.Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Aegis ErrorBoundary]', error.message, info.componentStack?.slice(0, 200));
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>Что-то пошло не так</div>
          <div style={{ color: T.textDim, fontSize: 13, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
            {this.state.error.message ?? 'Неизвестная ошибка'}
          </div>
          <Btn onClick={this.reset}>Попробовать снова</Btn>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── useAsyncAction hook ───────────────────────────────────────
function useAsyncAction(fn: () => Promise<unknown>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try { await fn(); }
    catch (e: any) { setError(e.message ?? 'Ошибка'); throw e; }
    finally { setLoading(false); }
  }, [fn, loading]);
  return { run, loading, error, clearError: () => setError(null) };
}

// ── LoadingBtn ────────────────────────────────────────────────
// Btn with built-in async loading state — prevents double-clicks,
// shows spinner, passes errors to parent via onError prop.
function LoadingBtn({ children, onClick, loadingText = '...', onError, ...props }: any) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (busy || props.disabled) return;
    setBusy(true);
    try { await onClick?.(); }
    catch (e: any) { onError?.(e.message ?? 'Ошибка'); }
    finally { setBusy(false); }
  };
  return (
    <Btn {...props} onClick={handle} disabled={busy || props.disabled}>
      {busy
        ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'aegis-spin 0.7s linear infinite' }} />
            {loadingText}
          </span>
        : children}
    </Btn>
  );
}

// ── Skeleton loader ───────────────────────────────────────────

function Skeleton({width='100%',height=16,radius=6,style={}}:any){
  return(
    <div style={{width,height,borderRadius:radius,background:T.surf3,
      overflow:'hidden',position:'relative',...style}}>
      <div className="aegis-shimmer" style={{position:'absolute',top:0,left:0,
        width:'100%',height:'100%',
        background:`linear-gradient(90deg,transparent 0%,${T.surf2}CC 50%,transparent 100%)`,
        transform:'translateX(-100%)',animation:'aegis-shimmer 1.6s infinite'}}/>
    </div>
  );
}

function SkeletonCard({lines=3,style={}}:any){
  return(
    <Card style={{padding:20,...style}}>
      <Skeleton height={14} width="40%" radius={4} style={{marginBottom:12}}/>
      {Array.from({length:lines}).map((_,i)=>(
        <Skeleton key={i} height={11} width={i===lines-1?'60%':'90%'} radius={3} style={{marginBottom:8}}/>
      ))}
    </Card>
  );
}

// ── Command Palette (Cmd+K) ───────────────────────────────────
function CommandPalette({isOpen,onClose,nav,history}:any){
  const [query,setQuery]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);
  const [selected,setSelected]=useState(0);

  useEffect(()=>{if(isOpen){setQuery('');setSelected(0);setTimeout(()=>inputRef.current?.focus(),50);}}, [isOpen]);

  const actions=[
    {icon:'＋',label:'Новая проверка',sub:'Начать 6-шаговый анализ сделки',action:()=>{nav('check');onClose();}},
    {icon:'↑',label:'Загрузить документ',sub:'PDF, DOCX, TXT → AI-извлечение',action:()=>{nav('documents');onClose();}},
    {icon:'⊞',label:'Дашборд',sub:'Метрики и последние проверки',action:()=>{nav('dashboard');onClose();}},
    {icon:'≡',label:'История проверок',sub:'Все проверки с фильтрами',action:()=>{nav('history');onClose();}},
    {icon:'◎',label:'Мониторинг',sub:'Watch-list контрагентов',action:()=>{nav('monitoring');onClose();}},
    {icon:'⚙',label:'Настройки',sub:'Профиль и параметры',action:()=>{nav('settings');onClose();}},
  ];

  const q=query.toLowerCase();
  const filteredActions=actions.filter(a=>!q||a.label.toLowerCase().includes(q)||a.sub.toLowerCase().includes(q));
  const filteredChecks=q
    ?history.filter((h:any)=>h.counterparty?.toLowerCase().includes(q)||h.country?.toLowerCase().includes(q)).slice(0,4)
    :history.slice(0,4);

  const allItems=[
    ...filteredActions.map((a:any)=>({...a,type:'action'})),
    ...filteredChecks.map((h:any)=>({
      type:'check',
      icon:h.result?.verdict==='BLOCKED'?'🔴':h.result?.verdict==='APPROVED'?'🟢':'🟡',
      label:h.counterparty,
      sub:`${h.country} · скор ${h.score??'—'} · ${fmtDate(h.date)}`,
      action:()=>{/* nav to result would need setResult */onClose();}
    })),
  ];

  useEffect(()=>{setSelected(0);},[query]);

  const handleKey=(e:any)=>{
    if(e.key==='ArrowDown'){e.preventDefault();setSelected(s=>Math.min(s+1,allItems.length-1));}
    if(e.key==='ArrowUp'){e.preventDefault();setSelected(s=>Math.max(s-1,0));}
    if(e.key==='Enter'&&allItems[selected]){allItems[selected].action();}
    if(e.key==='Escape'){onClose();}
  };

  if(!isOpen)return null;
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:10000,
      display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:120,
      backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div onClick={(e:any)=>e.stopPropagation()} style={{width:560,background:T.surf,
        border:`1px solid ${T.borderStr}`,borderRadius:12,overflow:'hidden',
        boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}}>
        {/* Search input */}
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',
          borderBottom:`1px solid ${T.border}`}}>
          <span style={{color:T.textSub,fontSize:16}}>🔍</span>
          <input ref={inputRef} value={query} onChange={(e:any)=>setQuery(e.target.value)}
            onKeyDown={handleKey} placeholder="Поиск или команда..."
            style={{flex:1,background:'none',border:'none',outline:'none',fontSize:14,
              color:T.text,fontFamily:"'Outfit',sans-serif"}}/>
          <kbd style={{background:T.surf2,border:`1px solid ${T.border}`,borderRadius:4,
            padding:'2px 6px',fontSize:11,color:T.textSub}}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{maxHeight:400,overflow:'auto',padding:'8px 0'}}>
          {!q&&<div style={{padding:'4px 16px 6px',fontSize:11,color:T.textSub,fontWeight:600,
            letterSpacing:'0.5px'}}>ДЕЙСТВИЯ</div>}
          {filteredActions.map((a:any,i:number)=>(
            <div key={i} onClick={a.action}
              style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',cursor:'pointer',
                background:selected===i?T.surf2:'transparent'}}
              onMouseEnter={()=>setSelected(i)}>
              <span style={{width:28,height:28,background:T.surf3,borderRadius:6,display:'flex',
                alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{a.icon}</span>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{a.label}</div>
                <div style={{fontSize:11,color:T.textDim}}>{a.sub}</div>
              </div>
              {i<3&&<kbd style={{marginLeft:'auto',background:T.surf2,border:`1px solid ${T.border}`,
                borderRadius:4,padding:'2px 6px',fontSize:10,color:T.textSub,flexShrink:0}}>
                ↵
              </kbd>}
            </div>
          ))}

          {filteredChecks.length>0&&(
            <>
              <div style={{padding:'8px 16px 6px',fontSize:11,color:T.textSub,fontWeight:600,
                letterSpacing:'0.5px',marginTop:4}}>ПОСЛЕДНИЕ ПРОВЕРКИ</div>
              {filteredChecks.map((h:any,i:number)=>{
                const idx=filteredActions.length+i;
                const icon=h.result?.verdict==='BLOCKED'?'🔴':h.result?.verdict==='APPROVED'?'🟢':'🟡';
                return(
                  <div key={i} onClick={()=>onClose()}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',cursor:'pointer',
                      background:selected===idx?T.surf2:'transparent'}}
                    onMouseEnter={()=>setSelected(idx)}>
                    <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.counterparty}</div>
                      <div style={{fontSize:11,color:T.textDim}}>{h.country} · {h.form?.product??h.product??'—'}</div>
                    </div>
                    <span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,
                      color:riskColor(h.score??0),flexShrink:0}}>
                      {h.score??'—'}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {allItems.length===0&&(
            <div style={{padding:'28px 16px',textAlign:'center',color:T.textSub,fontSize:13}}>
              Ничего не найдено
            </div>
          )}
        </div>

        <div style={{padding:'8px 16px',borderTop:`1px solid ${T.border}`,
          display:'flex',gap:16,fontSize:11,color:T.textSub}}>
          <span>↑↓ Навигация</span><span>↵ Выбор</span><span>ESC Закрыть</span>
        </div>
      </div>
    </div>
  );
}

// ── Onboarding wizard ─────────────────────────────────────────
function Onboarding({onClose,nav}:any){
  const [step,setStep]=useState(1);
  const steps=[
    {
      icon:'🏛',title:'Добро пожаловать в Aegis Comply',
      desc:'Платформа санкционного скрининга и AI-assisted compliance для ВЭД. Инструмент поддержки принятия решений для комплаенс-офицеров. Покажу, как это работает за 60 секунд.',
      action:null,
    },
    {
      icon:'🔍',title:'Как работает проверка сделки',
      desc:'Вы вводите контрагента и параметры сделки. Aegis проверяет его по OFAC, EU, UN, UK и другим базам в реальном времени, затем AI анализирует маршрут, платёж и структуру владения.',
      action:{label:'Запустить первую проверку →',fn:(n:any)=>n('check')},
    },
    {
      icon:'📋',title:'Evidence Vault — PDF для банка',
      desc:'Каждая проверка генерирует юридический PDF-отчёт с источниками, risk score и рекомендациями. Это то, что банк запросит при KYC.',
      action:{label:'Посмотреть историю проверок →',fn:(n:any)=>n('history')},
    },
  ];
  const s=steps[step-1];
  const done=()=>{localStorage.setItem('aegis_onboarded','1');onClose();};
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:9998,
      display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}>
      <div style={{width:480,background:T.surf,border:`1px solid ${T.borderStr}`,
        borderRadius:16,padding:36,boxShadow:'0 32px 80px rgba(0,0,0,0.4)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:16}}>{s.icon}</div>
          <h2 style={{fontSize:20,fontWeight:800,marginBottom:12,letterSpacing:'-0.5px'}}>{s.title}</h2>
          <p style={{color:T.textDim,fontSize:14,lineHeight:1.7}}>{s.desc}</p>
        </div>
        {/* Step dots */}
        <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:28}}>
          {steps.map((_,i)=>(
            <div key={i} style={{width:i+1===step?24:8,height:8,borderRadius:4,
              background:i+1===step?T.blue:T.surf3,transition:'width 0.3s'}}/>
          ))}
        </div>
        <div style={{display:'flex',gap:10}}>
          {step<3?(
            <>
              <Btn variant="ghost" onClick={done} style={{flex:1,justifyContent:'center'}}>Пропустить</Btn>
              <Btn onClick={()=>setStep(s=>s+1)} style={{flex:2,justifyContent:'center'}}>Далее →</Btn>
            </>
          ):(
            <>
              <Btn variant="ghost" onClick={done} style={{flex:1,justifyContent:'center'}}>Закрыть</Btn>
              {s.action&&<Btn onClick={()=>{done();s.action?.fn(nav);}} style={{flex:2,justifyContent:'center'}}>{s.action.label}</Btn>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── LANDING ─────────────────────────────────────────────────
function Landing({nav}:any){
  const modules=[
    {icon:'🏛',t:'Санкционный скрининг',d:'OFAC SDN/SSI, EU консолид., UN, UK OFSI, BIS — реальные данные OpenSanctions'},
    {icon:'📦',t:'Экспортный контроль',d:'ТН ВЭД, dual-use ФЗ-183, EU Reg 2021/821, ФСТЭК, Common High Priority Items'},
    {icon:'🔍',t:'UBO / Правило 50%',d:'Цепочка бенефициаров, косвенное санкционное воздействие, правило 50% OFAC'},
    {icon:'💳',t:'Платёжный коридор',d:'Риск блокировки корреспондентским банком, валютные пары, альтернативные маршруты'},
    {icon:'🗺',t:'Маршрут / Антиобход',d:'Red flags транзитных юрисдикций, Shadow Fleet, схемы обхода санкций'},
    {icon:'📋',t:'Evidence Vault',d:'Профессиональный PDF-отчёт с нормами, источниками, audit trail для банка/суда'},
  ];
  return(
    <div style={{minHeight:'100vh',background:T.bg}}>
      <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 48px',height:60,
        borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,background:T.bg,zIndex:50}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,background:T.blue,borderRadius:8,display:'flex',alignItems:'center',
            justifyContent:'center',fontWeight:900,fontSize:16,color:'#fff'}}>A</div>
          <span style={{fontWeight:800,fontSize:16,letterSpacing:'-0.3px'}}>AEGIS COMPLY</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" onClick={()=>nav('auth')} size="sm">Войти</Btn>
          <Btn onClick={()=>nav('auth')} size="sm">Начать бесплатно →</Btn>
        </div>
      </nav>

      <section style={{padding:'88px 48px 72px',textAlign:'center',
        background:`radial-gradient(ellipse 80% 40% at 50% 0%,rgba(69,117,243,0.12),transparent)`}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,background:T.blueDim,
          border:`1px solid ${T.borderStr}`,borderRadius:20,padding:'5px 14px',fontSize:12,
          color:T.blue,marginBottom:28,fontWeight:600}}>
          Реальные данные OpenSanctions · DeepSeek AI · Аудируемые результаты
        </div>
        <h1 style={{fontSize:52,fontWeight:900,lineHeight:1.1,marginBottom:20,letterSpacing:'-1.5px',
          background:`linear-gradient(160deg,${T.text} 0%,${T.textDim} 100%)`,
          WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
          Двойной комплаенс<br/>для ВЭД за 30 секунд
        </h1>
        <p style={{fontSize:17,color:T.textDim,maxWidth:560,margin:'0 auto 40px',lineHeight:1.75}}>
          Платформа санкционного скрининга и экспортного контроля
          на основе реальных данных OpenSanctions для МСП в ВЭД
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:64}}>
          <Btn onClick={()=>nav('auth')} size="lg" style={{padding:'12px 32px'}}>Запустить скрининг бесплатно</Btn>
          <Btn variant="ghost" size="lg" style={{padding:'12px 32px'}}>Посмотреть демо</Btn>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:48,flexWrap:'wrap',
          padding:'24px 0',borderTop:`1px solid ${T.border}`}}>
          {[{v:'50+',l:'Санкционных баз'},{v:'6',l:'Модулей анализа'},{v:'ODC-BY',l:'Лицензия OpenSanctions'},{v:'< 30с',l:'Время проверки'}]
            .map(s=>(
            <div key={s.l} style={{textAlign:'center'}}>
              <div style={{fontSize:28,fontWeight:900,color:T.blue,fontFamily:T.mono}}>{s.v}</div>
              <div style={{fontSize:12,color:T.textDim,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{padding:'60px 48px',maxWidth:1100,margin:'0 auto'}}>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8,letterSpacing:'-0.5px'}}>End-to-end комплаенс</h2>
        <p style={{color:T.textDim,marginBottom:36,fontSize:14}}>5 аналитических модулей + Evidence Vault — полный compliance workflow</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
          {modules.map((m,i)=>(
            <Card key={i} style={{padding:24}}>
              <div style={{fontSize:28,marginBottom:12}}>{m.icon}</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>{m.t}</div>
              <div style={{fontSize:13,color:T.textDim,lineHeight:1.65}}>{m.d}</div>
            </Card>
          ))}
        </div>
      </section>

      <section style={{margin:'0 48px 60px',borderRadius:12,padding:40,
        background:`linear-gradient(135deg,${T.surf},${T.surf2})`,border:`1px solid ${T.border}`}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:48,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:260}}>
            <div style={{color:T.blue,fontSize:12,fontWeight:700,letterSpacing:1,marginBottom:10}}>РЕАЛЬНЫЕ ДАННЫЕ</div>
            <h3 style={{fontSize:24,fontWeight:800,marginBottom:12,letterSpacing:'-0.5px'}}>
              Реальные санкционные данные,<br/>не AI-симуляция
            </h3>
            <p style={{color:T.textDim,fontSize:14,lineHeight:1.7}}>
              Платформа использует OpenSanctions — open-source агрегатор официальных санкционных списков.
              Каждый хит подтверждён конкретным источником с указанием dataset ID и уровня совпадения.
            </p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,minWidth:300}}>
            {['OFAC SDN/SSI','EU Consolidated','UN Security Council','UK OFSI',
              'BIS Entity List','ЕГРЮЛ Sanctions','+ 44 других базы','50+ итого'].map((s,i)=>(
              <div key={i} style={{background:i>=6?T.blueDim:T.surf3,
                border:`1px solid ${i>=6?T.blue:T.border}`,borderRadius:6,
                padding:'8px 12px',fontSize:12,color:i>=6?T.blue:T.textDim,fontWeight:i>=6?700:400}}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{margin:'0 48px 80px',textAlign:'center',padding:'56px 32px',borderRadius:12,
        background:`linear-gradient(135deg,rgba(69,117,243,0.15),rgba(69,117,243,0.05))`,
        border:`1px solid ${T.borderStr}`}}>
        <h2 style={{fontSize:30,fontWeight:800,marginBottom:12,letterSpacing:'-0.5px'}}>Первые 5 проверок — бесплатно</h2>
        <p style={{color:T.textDim,marginBottom:8,fontSize:14}}>5 проверок бесплатно. Без привязки карты.</p>
          <p style={{color:T.textSub,marginBottom:28,fontSize:11}}>Результаты носят информационный характер и не являются юридическим заключением.</p>
        <Btn onClick={()=>nav('auth')} size="lg">Начать бесплатно →</Btn>
      </section>

      <footer style={{borderTop:`1px solid ${T.border}`,padding:'20px 48px',
        display:'flex',justifyContent:'space-between',fontSize:12,color:T.textSub}}>
        <span style={{fontWeight:700,color:T.textDim}}>AEGIS COMPLY © 2026</span>
        <span>rafail.filatov@yandex.ru · Финансовый университет при Правительстве РФ</span>
      </footer>
    </div>
  );
}

// ── AUTH ──────────────────────────────────────────────────────
function Auth({nav,setUser,toast}:any){
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');const [pass,setPass]=useState('');
  const [name,setName]=useState('');const [company,setCompany]=useState('');
  const [err,setErr]=useState('');const [loading,setLoading]=useState(false);

  const go=async()=>{
    if(!email||!pass){setErr('Заполните все поля');return;}
    if(mode==='register'&&pass.length<8){setErr('Пароль минимум 8 символов');return;}
    setLoading(true);setErr('');
    try{
      const data=mode==='login'
        ?await apiLogin(email,pass)
        :await apiRegister(email,pass,name||email.split('@')[0],company||'Моя компания');
      setUser(data.user);toast('Добро пожаловать, '+data.user.name);nav('dashboard');
    }catch(e:any){
      setErr(
        e.message==='Invalid credentials'?'Неверный email или пароль. Проверьте данные.':
        e.message?.includes('already')?'Аккаунт с таким email уже существует':
        e.message??'Ошибка входа — попробуйте снова'
      );
    }finally{setLoading(false);}
  };

  return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:T.bg}}>
      <div style={{width:400}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{width:44,height:44,background:T.blue,borderRadius:12,display:'flex',alignItems:'center',
            justifyContent:'center',fontWeight:900,fontSize:22,color:'#fff',margin:'0 auto 12px'}}>A</div>
          <div style={{fontWeight:800,fontSize:20}}>AEGIS COMPLY</div>
          <div style={{color:T.textDim,fontSize:13,marginTop:4}}>
            {mode==='login'?'Вход в платформу':'Создать аккаунт'}
          </div>
        </div>
        <Card style={{padding:28}}>
          {mode==='register'&&<>
            <Inp label="Имя" value={name} onChange={setName} placeholder="Иван Иванов"/>
            <Inp label="Компания" value={company} onChange={setCompany} placeholder="ООО Торговля"/>
          </>}
          <Inp label="Email" value={email} onChange={setEmail} placeholder="ivan@company.ru" type="email"/>
          <Inp label="Пароль" value={pass} onChange={setPass} placeholder="••••••••" type="password"
            hint={mode==='register'?'Минимум 8 символов':''}/>
          {err&&<div style={{color:T.red,fontSize:12,marginBottom:14,padding:'8px 12px',
            background:T.redDim,borderRadius:6,border:`1px solid ${T.red}`}}>{err}</div>}
          <Btn onClick={go} disabled={loading} style={{width:'100%',justifyContent:'center',padding:'11px'}}>
            {loading?'...':(mode==='login'?'Войти':'Создать аккаунт')}
          </Btn>
          {mode==='register'&&(
            <div style={{background:T.greenDim,border:`1px solid ${T.green}`,borderRadius:6,
              padding:'8px 12px',fontSize:12,color:T.green,marginBottom:14,textAlign:'center'}}>
              🎁 Первые 5 проверок бесплатно · Без привязки карты
            </div>
          )}
          <div style={{textAlign:'center',fontSize:12,color:T.textDim,marginTop:16}}>
            {mode==='login'?'Нет аккаунта? ':'Уже есть аккаунт? '}
            <span onClick={()=>{setMode(mode==='login'?'register':'login');setErr('');}}
              style={{color:T.blue,cursor:'pointer',fontWeight:600}}>
              {mode==='login'?'Зарегистрироваться':'Войти'}
            </span>
          </div>
        </Card>
        <div style={{textAlign:'center',marginTop:16}}>
          <span onClick={()=>nav('landing')} style={{fontSize:12,color:T.textSub,cursor:'pointer'}}>← На главную</span>
        </div>
      </div>
    </div>
  );
}

// ── SHELL ─────────────────────────────────────────────────────
const NAV_ITEMS=[
  {id:'dashboard',icon:'⊞',label:'Дашборд'},
  {id:'check',icon:'＋',label:'Новая проверка'},
  {id:'history',icon:'≡',label:'История'},
  {id:'reviews',icon:'◈',label:'Очередь проверок'},
  {id:'documents',icon:'↑',label:'Документы'},
  {id:'monitoring',icon:'◎',label:'Мониторинг'},
  {id:'settings',icon:'⚙',label:'Настройки'},
];

function Shell({user,view,nav,logout,children,alertCount,reviewCount,setCmdOpen}:any){
  const winW = useWindowWidth();
  const collapsed = winW < 960;   // icon-only on tablet
  const hidden    = winW < 640;   // full hide on mobile
  const [mobileOpen, setMobileOpen] = useState(false);
  const showSidebar = !hidden || mobileOpen;
  const sidebarW = collapsed ? 60 : 220;

  return(
    <div style={{display:'flex',minHeight:'100vh',background:T.bg}}>
      {/* Mobile overlay */}
      {hidden && mobileOpen && (
        <div onClick={()=>setMobileOpen(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:40}}/>
      )}

      {/* Sidebar */}
      {showSidebar&&(
        <aside style={{
          width:sidebarW,background:T.surf,borderRight:`1px solid ${T.border}`,
          display:'flex',flexDirection:'column',flexShrink:0,
          position:hidden?'fixed':'sticky',top:0,height:'100vh',zIndex:50,
          transition:'width 0.2s',overflow:'hidden',
        }}>
          <div style={{padding:collapsed?'16px 0':'18px 16px',
            borderBottom:`1px solid ${T.border}`,
            display:'flex',alignItems:'center',justifyContent:collapsed?'center':'flex-start',
            gap:collapsed?0:10}}>
            <div style={{width:28,height:28,background:T.blue,borderRadius:7,display:'flex',
              alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:14,
              color:'#fff',flexShrink:0}}>A</div>
            {!collapsed&&<span style={{fontWeight:800,fontSize:14,letterSpacing:'-0.3px',
              whiteSpace:'nowrap'}}>AEGIS COMPLY</span>}
          </div>
          <nav style={{flex:1,padding:collapsed?'10px 4px':'10px 8px'}}>
            {NAV_ITEMS.map(item=>{
              const active=view===item.id;
              const hasAlert=(item.id==='monitoring'&&alertCount>0)||(item.id==='reviews'&&reviewCount>0);
              const badgeCount=item.id==='monitoring'?alertCount:item.id==='reviews'?reviewCount:0;
              return(
                <div key={item.id} onClick={()=>{nav(item.id);setMobileOpen(false);}}
                  title={collapsed?item.label:undefined}
                  style={{
                    display:'flex',alignItems:'center',gap:collapsed?0:10,
                    padding:collapsed?'10px 0':'9px 12px',borderRadius:7,
                    justifyContent:collapsed?'center':'flex-start',
                    marginBottom:2,cursor:'pointer',
                    background:active?T.surf2:'transparent',
                    color:active?T.text:T.textDim,fontSize:13,fontWeight:active?600:400,
                    border:active?`1px solid ${T.border}`:'1px solid transparent',
                    position:'relative',minHeight:38,
                  }}>
                  <span style={{fontSize:16,width:collapsed?'100%':18,textAlign:'center',flexShrink:0}}>{item.icon}</span>
                  {!collapsed&&item.label}
                  {hasAlert&&!collapsed&&(
                    <span style={{marginLeft:'auto',background:T.red,color:'#fff',
                      borderRadius:20,padding:'1px 6px',fontSize:10,fontWeight:700}}>{badgeCount}</span>
                  )}
                  {hasAlert&&collapsed&&(
                    <span style={{position:'absolute',top:4,right:4,width:8,height:8,
                      background:T.red,borderRadius:'50%'}}/>
                  )}
                </div>
              );
            })}
          </nav>
          <div style={{padding:collapsed?'10px 4px':'12px 16px',borderTop:`1px solid ${T.border}`}}>
            {!collapsed&&(
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <div style={{width:28,height:28,background:T.surf3,borderRadius:'50%',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:12,fontWeight:700,color:T.blue,flexShrink:0}}>
                  {user.name?.[0]?.toUpperCase()??'U'}
                </div>
                <div style={{overflow:'hidden',minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.name}</div>
                  <div style={{fontSize:10,color:T.textDim,textTransform:'capitalize'}}>{user.plan??'free'}</div>
                </div>
              </div>
            )}
            {collapsed?(
              <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'center'}}>
                <span title={user.name} style={{width:28,height:28,background:T.surf3,
                  borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:12,fontWeight:700,color:T.blue,cursor:'pointer'}}
                  onClick={logout}>
                  {user.name?.[0]?.toUpperCase()??'U'}
                </span>
              </div>
            ):(
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span onClick={logout} style={{fontSize:11,color:T.textSub,cursor:'pointer'}}>Выйти →</span>
                <kbd onClick={()=>setCmdOpen(true)} style={{background:T.surf3,
                  border:`1px solid ${T.border}`,borderRadius:4,
                  padding:'2px 6px',fontSize:10,color:T.textSub,cursor:'pointer'}}>⌘K</kbd>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Mobile hamburger */}
      {hidden&&!mobileOpen&&(
        <button onClick={()=>setMobileOpen(true)}
          style={{position:'fixed',top:12,left:12,zIndex:60,width:36,height:36,
            background:T.surf,border:`1px solid ${T.border}`,borderRadius:8,
            display:'flex',flexDirection:'column',gap:4,alignItems:'center',
            justifyContent:'center',cursor:'pointer',padding:0}}>
          {[0,1,2].map(i=><span key={i} style={{width:16,height:2,background:T.text,borderRadius:1}}/>)}
        </button>
      )}

      <main style={{
        flex:1,overflow:'auto',minWidth:0,
        paddingLeft: hidden&&!mobileOpen ? 0 : undefined,
        paddingTop:  hidden&&!mobileOpen ? 52 : undefined,  // space for hamburger button
      }}>{children}</main>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dashboard({nav,history,user,alertCount}:any){
  const [stats,setStats]=useState<any>(null);
  useEffect(()=>{apiGetStats().then(setStats).catch(()=>{});},[]);
  const sc=riskColor;

  return(
    <div style={{padding:'28px 32px'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.5px'}}>Добро пожаловать, {user.name} 👋</h1>
        <p style={{color:T.textDim,fontSize:13,marginTop:4}}>
          {fmtDateLong(new Date().toISOString())}
        </p>
      </div>

      {!stats&&!history.length?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[0,1,2,3].map(i=><SkeletonCard key={i} lines={1} style={{padding:'18px 20px'}}/>)}
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[
            {label:'Всего проверок',value:stats?.total??history.length,color:T.blue},
            {label:'Высокий риск',value:stats?.byRisk?.high??history.filter((h:any)=>h.result?.overall==='HIGH').length,color:T.red},
            {label:'Одобрено',value:stats?.byRisk?.low??history.filter((h:any)=>h.result?.verdict==='APPROVED').length,color:T.green},
            {label:'Средний скор',value:stats?.avgScore?`${stats.avgScore}`:'—',color:T.amber},
          ].map(k=>(
            <Card key={k.label} style={{padding:'18px 20px'}}>
              <div style={{fontSize:30,fontWeight:900,color:k.color,fontFamily:T.mono,marginBottom:4}}>{k.value}</div>
              <div style={{fontSize:12,color:T.textDim}}>{k.label}</div>
            </Card>
          ))}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:24}}>
        <Card style={{padding:24,background:`linear-gradient(135deg,${T.surf},rgba(69,117,243,0.06))`}}>
          <div style={{fontSize:36,marginBottom:10}}>🔍</div>
          <h2 style={{fontSize:17,fontWeight:700,marginBottom:8}}>Новая проверка сделки</h2>
          <p style={{color:T.textDim,fontSize:13,lineHeight:1.6,marginBottom:16}}>
            Реальный скрининг 50+ санкционных баз + AI-анализ маршрута, платежа, UBO
          </p>
          <div style={{display:'flex',gap:10}}>
            <Btn onClick={()=>nav('check')}>Новая проверка →</Btn>
            <Btn variant="secondary" onClick={()=>nav('documents')}>↑ Загрузить документ</Btn>
          </div>
        </Card>
        <Card style={{padding:18}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            Мониторинг
            {alertCount>0&&<span style={{background:T.redDim,color:T.red,padding:'2px 8px',
              borderRadius:20,fontSize:11,fontWeight:700}}>{alertCount} алертов</span>}
          </div>
          {alertCount>0?(
            <div>
              <div style={{background:T.redDim,border:`1px solid ${T.red}`,borderRadius:7,
                padding:'10px 12px',marginBottom:10}}>
                <div style={{color:T.red,fontSize:12,fontWeight:700}}>⚠ Требует внимания</div>
                <div style={{color:T.textDim,fontSize:11,marginTop:3}}>Изменения в watch-list</div>
              </div>
              <Btn variant="ghost" size="sm" style={{width:'100%',justifyContent:'center'}}
                onClick={()=>nav('monitoring')}>Открыть мониторинг</Btn>
            </div>
          ):(
            <div>
              <div style={{color:T.textSub,fontSize:12,marginBottom:12}}>Активных алертов нет</div>
              <Btn variant="ghost" size="sm" onClick={()=>nav('monitoring')}>+ Добавить в watch-list</Btn>
            </div>
          )}
        </Card>
      </div>

      {stats?.trend?.length>2&&(
        <Card style={{padding:20,marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Динамика риск-скора (14 дней)</div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={stats.trend} margin={{top:0,right:0,left:0,bottom:0}}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.blue} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={T.blue} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{fontSize:9,fill:T.textSub}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:T.surf2,border:`1px solid ${T.border}`,borderRadius:6,fontSize:11}}/>
              <Area type="monotone" dataKey="score" stroke={T.blue} fill="url(#scoreGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {history.slice(0,5).length>0?(
        <Card>
          <div style={{padding:'14px 20px',borderBottom:`1px solid ${T.border}`,
            display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:700,fontSize:13}}>Последние проверки</span>
            <span onClick={()=>nav('history')} style={{fontSize:12,color:T.blue,cursor:'pointer'}}>Все →</span>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {['Контрагент','Страна','Вердикт','Скор','Дата'].map(h=>(
                  <th key={h} style={{padding:'8px 20px',textAlign:'left',fontSize:11,color:T.textSub,fontWeight:600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.slice(0,5).map((h:any,i:number)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`,cursor:'pointer'}}
                  onMouseEnter={(e:any)=>e.currentTarget.style.background=T.surf2}
                  onMouseLeave={(e:any)=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'10px 20px',fontSize:13,fontWeight:600}}>{h.counterparty}</td>
                  <td style={{padding:'10px 20px',fontSize:12,color:T.textDim}}>{h.country}</td>
                  <td style={{padding:'10px 20px'}}><VerdictBadge verdict={h.result?.verdict}/></td>
                  <td style={{padding:'10px 20px',fontFamily:T.mono,fontSize:13,
                    color:riskColor(h.score??0)}}>{h.score??'—'}</td>
                  <td style={{padding:'10px 20px',fontSize:11,color:T.textSub}}>{fmtDate(h.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ):(
        <Card style={{textAlign:'center',padding:56,
          background:`linear-gradient(135deg,${T.surf},rgba(69,117,243,0.04))`}}>
          <div style={{fontSize:40,marginBottom:14}}>🔍</div>
          <div style={{fontWeight:800,fontSize:18,marginBottom:10,letterSpacing:'-0.5px'}}>
            Начните первую проверку
          </div>
          <p style={{color:T.textDim,fontSize:14,marginBottom:6,lineHeight:1.7,maxWidth:420,margin:'0 auto 8px'}}>
            Реальный скрининг по 50+ санкционным спискам (OFAC, EU, UN, UK OFSI)
            + AI-анализ экспортного контроля, UBO и платёжного коридора
          </p>
          <p style={{color:T.textSub,fontSize:12,marginBottom:24}}>Результат за 30 секунд · Evidence vault PDF</p>
          <div style={{display:'flex',gap:12,justifyContent:'center'}}>
            <Btn onClick={()=>nav('check')} style={{padding:'10px 28px'}}>Запустить проверку →</Btn>
            <Btn variant="secondary" onClick={()=>nav('documents')}>↑ Загрузить документ</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── CHECK FORM ────────────────────────────────────────────────
const CHECK_STEPS=[
  {n:1,label:'Контрагент',icon:'🏛'},{n:2,label:'Товар',icon:'📦'},
  {n:3,label:'Структура',icon:'🔍'},{n:4,label:'Платёж',icon:'💳'},
  {n:5,label:'Маршрут',icon:'🗺'},{n:6,label:'Итог',icon:'✓'},
];
const LOADING_STEPS=[
  '🏛 Скрининг OFAC SDN/SSI, EU, UN, UK OFSI, BIS (OpenSanctions)...',
  '📦 Квалификация ТН ВЭД и экспортный контроль ФЗ-183...',
  '🔍 Анализ UBO и правило 50% OFAC...',
  '💳 Оценка платёжного коридора и банков...',
  '🗺 Проверка маршрута и антиобход санкций...',
];

function CheckForm({nav,setResult,addToHistory,toast,prefillForm,clearPrefill}:any){
  const [step,setStep]=useState(1);
  const emptyF={cp:'',country:'',ctype:'',reg:'',product:'',tnved:'',dual:'',enduse:'',
    ubo:'',uboCountry:'',ownership:'',currency:'',val:'',bank:'',payMethod:'',
    transit:'',vessel:'',finalDest:''};
  const [f,setF]=useState(emptyF);
  const [err,setErr]=useState('');const [loading,setLoading]=useState(false);
  const [loadStep,setLoadStep]=useState(-1);
  const upd=(k:string,v:string)=>setF((p:any)=>({...p,[k]:v}));

  // Auto-save draft to localStorage — restores if user navigates away
  useEffect(()=>{
    if(f.cp||f.product) localStorage.setItem('aegis_form_draft',JSON.stringify(f));
  },[f]);
  // Restore draft on mount (only if not prefilled from document)
  useEffect(()=>{
    if(!prefillForm){
      try{
        const d=localStorage.getItem('aegis_form_draft');
        if(d){const p=JSON.parse(d);if(p.cp){setF(p);toast('Черновик формы восстановлен','info');}}
      }catch{}
    }
  },[]); // eslint-disable-line

  useEffect(()=>{
    if(prefillForm){setF((p:any)=>({...p,...prefillForm}));clearPrefill?.();toast('Данные загружены','info');}
  },[prefillForm]); // eslint-disable-line

  const analyze=async()=>{
    setLoading(true);setErr('');setLoadStep(0);
    // Theatrical progress — stops at last step until response returns
    const timers = LOADING_STEPS.map((_,i)=>setTimeout(()=>setLoadStep(i), i * 1400));
    // Cleanup function stored for manual advancement
    void timers; // timers will be overridden by setLoadStep(LOADING_STEPS.length) on success
    try{
      const check=await apiCreateCheck(f as any);
      // Mark all loading steps complete immediately (don't let animation outlive response)
      setLoadStep(LOADING_STEPS.length);
      const mapped=mapCheck(check);
      addToHistory(mapped);setResult(mapped.result);
      localStorage.removeItem('aegis_form_draft');
      toast('Проверка завершена');nav('result');
    }catch(e:any){
      if(e.message==='SESSION_EXPIRED'){
        // Form draft already auto-saved to localStorage — user can continue after re-login
        toast('Сессия истекла. Ваш черновик сохранён — войдите снова.','error');
        nav('auth');return;
      }
      if(e.code==='QUOTA_EXCEEDED'){setErr(e.message);toast('Лимит проверок исчерпан','error');return;}
      if(e.code==='AI_UNAVAILABLE'){setErr('AI-сервис временно недоступен. Попробуйте через 30 секунд.');toast('AI недоступен','error');return;}
      if(e.code==='RATE_LIMITED'){setErr(e.message);toast(e.message,'error');return;}
      setErr('Ошибка: '+(e.message??'попробуйте снова'));toast('Ошибка анализа','error');
    }finally{setLoading(false);setLoadStep(-1);}
  };

  const next=()=>{
    if(step===1&&!f.cp){setErr('Введите контрагента');return;}
    if(step===1&&!f.country){setErr('Выберите страну');return;}
    if(step===2&&!f.product){setErr('Введите товар');return;}
    setErr('');setStep(s=>s+1);
  };

  const ctypes=[{v:'ООО',l:'ООО'},{v:'АО',l:'АО'},{v:'LLC',l:'LLC'},
    {v:'LTD',l:'LTD'},{v:'INC',l:'INC'},{v:'FZE',l:'FZE (ОАЭ)'},{v:'OTHER',l:'Другое'}];
  const dualOpts=[{v:'yes',l:'⚠ Да — двойное назначение'},{v:'no',l:'Нет'},{v:'unknown',l:'Неизвестно'}];
  const payOpts=[{v:'SWIFT',l:'SWIFT'},{v:'SEPA',l:'SEPA'},{v:'Крипто',l:'Крипто / стейблкоины'},
    {v:'НКО',l:'НКО / платёжный агент'},{v:'Аккредитив',l:'Документарный аккредитив'}];

  return(
    <div style={{padding:'28px 32px',maxWidth:660}}>
      <span onClick={()=>nav('dashboard')} style={{color:T.textDim,cursor:'pointer',fontSize:12,marginBottom:16,display:'block'}}>← Назад</span>
      <h1 style={{fontSize:20,fontWeight:800,marginBottom:4,letterSpacing:'-0.5px'}}>Новая проверка сделки</h1>
      <p style={{color:T.textDim,marginBottom:24,fontSize:13}}>Реальный скрининг OpenSanctions + 5-модульный AI-анализ + 6-шаговая форма</p>

      <div style={{display:'flex',gap:6,marginBottom:24}}>
        {CHECK_STEPS.map(s=>(
          <div key={s.n} onClick={()=>step>s.n&&setStep(s.n)} style={{
            flex:1,textAlign:'center',padding:'8px 4px',borderRadius:7,fontSize:10,fontWeight:600,
            cursor:step>s.n?'pointer':'default',
            background:step===s.n?T.blueDim:step>s.n?T.greenDim:T.surf2,
            color:step===s.n?T.blue:step>s.n?T.green:T.textSub,
            border:`1px solid ${step===s.n?T.blue:step>s.n?T.green:T.border}`}}>
            <div style={{fontSize:14,marginBottom:2}}>{step>s.n?'✓':s.icon}</div>{s.label}
          </div>
        ))}
      </div>

      <Card style={{padding:24}}>
        {step===1&&<div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:18}}>① Контрагент</div>
          <Inp label="Наименование контрагента *" value={f.cp} onChange={(v:string)=>upd('cp',v)} placeholder="ACME Trading Co. Ltd"/>
          <Sel label="Страна регистрации *" value={f.country} onChange={(v:string)=>upd('country',v)} options={COUNTRIES}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Sel label="Тип юр. лица" value={f.ctype} onChange={(v:string)=>upd('ctype',v)} options={ctypes}/>
            <Inp label="ИНН / рег. номер" value={f.reg} onChange={(v:string)=>upd('reg',v)} placeholder="1234567890"/>
          </div>
          <div style={{background:T.blueDim,border:`1px solid ${T.borderStr}`,borderRadius:7,
            padding:'10px 14px',fontSize:12,color:T.blue}}>
            ℹ Будет проверен по OpenSanctions (50+ санкционных списков) в реальном времени
          </div>
        </div>}

        {step===2&&<div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:18}}>② Товар / Технология</div>
          <Inp label="Описание товара *" value={f.product} onChange={(v:string)=>upd('product',v)} placeholder="Промышленные насосы высокого давления"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Inp label="Код ТН ВЭД" value={f.tnved} onChange={(v:string)=>upd('tnved',v)} placeholder="8413 50 800 0" hint="10-значный код"/>
            <Sel label="Двойное назначение" value={f.dual} onChange={(v:string)=>upd('dual',v)} options={dualOpts}/>
          </div>
          <Inp label="Конечное использование / конечный пользователь" value={f.enduse} onChange={(v:string)=>upd('enduse',v)} placeholder="Нефтеперерабатывающий завод"/>
        </div>}

        {step===3&&<div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>③ Корпоративная структура / UBO</div>
          <div style={{color:T.textDim,fontSize:12,marginBottom:18,lineHeight:1.6}}>
            Правило 50% OFAC: если подсанкционное лицо прямо или косвенно владеет ≥50% — организация тоже под санкциями
          </div>
          <Inp label="Бенефициарный владелец (UBO) — необязательно" value={f.ubo} onChange={(v:string)=>upd('ubo',v)} placeholder="Иванов Иван Иванович"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Sel label="Страна UBO" value={f.uboCountry} onChange={(v:string)=>upd('uboCountry',v)} options={COUNTRIES}/>
            <Inp label="Доля участия (%)" value={f.ownership} onChange={(v:string)=>upd('ownership',v)} placeholder="51"/>
          </div>
        </div>}

        {step===4&&<div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>④ Платёжный коридор</div>
          <div style={{color:T.textDim,fontSize:12,marginBottom:18}}>
            Риск блокировки корреспондентским банком при расчётах через подсанкционные юрисдикции
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Sel label="Валюта расчёта" value={f.currency} onChange={(v:string)=>upd('currency',v)} options={CURRENCIES}/>
            <Inp label="Сумма сделки" value={f.val} onChange={(v:string)=>upd('val',v)} placeholder="1 000 000"/>
          </div>
          <Inp label="Банк для расчётов — необязательно" value={f.bank} onChange={(v:string)=>upd('bank',v)} placeholder="Bank of China, Shanghai"/>
          <Sel label="Способ расчёта" value={f.payMethod} onChange={(v:string)=>upd('payMethod',v)} options={payOpts}/>
        </div>}

        {step===5&&<div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>⑤ Маршрут / Антиобход санкций</div>
          <div style={{color:T.textDim,fontSize:12,marginBottom:18}}>
            Транзитные юрисдикции — ключевой red flag. Укажите реальный маршрут.
          </div>
          <Inp label="Транзитные страны / маршрут" value={f.transit} onChange={(v:string)=>upd('transit',v)} placeholder="Казахстан → Россия"/>
          <Inp label="Перевозчик / судно / логист — необязательно" value={f.vessel} onChange={(v:string)=>upd('vessel',v)} placeholder="DHL / FESCO / Маерск"
            hint="Судно будет проверено по признакам Shadow Fleet"/>
          <Sel label="Страна конечного назначения" value={f.finalDest} onChange={(v:string)=>upd('finalDest',v)} options={COUNTRIES}/>
        </div>}

        {step===6&&<div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:18}}>⑥ Подтверждение</div>
          <div style={{background:T.surf2,borderRadius:8,padding:16,marginBottom:16}}>
            {([['Контрагент',f.cp],['Страна',COUNTRIES.find(c=>c.v===f.country)?.l??f.country],
              ['Товар',f.product],['ТН ВЭД',f.tnved||'—'],['Двойное назн.',f.dual||'—'],
              ['Валюта',f.currency||'—'],['Маршрут',f.transit||'Прямой']] as [string,string][]).map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',
                borderBottom:`1px solid ${T.border}`,fontSize:13}}>
                <span style={{color:T.textDim}}>{k}</span>
                <span style={{fontWeight:600,maxWidth:280,textAlign:'right',overflow:'hidden',
                  textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v||'—'}</span>
              </div>
            ))}
          </div>
          <div style={{background:T.blueDim,border:`1px solid ${T.borderStr}`,borderRadius:7,
            padding:'10px 14px',fontSize:12,color:T.blue,marginBottom:8,lineHeight:1.5}}>
            ⚡ Запустит: OpenSanctions скрининг (OFAC SDN, EU, UN, UK, BIS) +
            DeepSeek AI-анализ (экспортный контроль, UBO, платёж, маршрут)
          </div>
          <div style={{fontSize:11,color:T.textSub,marginBottom:12,lineHeight:1.5}}>
            Результат является инструментом поддержки решений. Время: 15–30 сек.
          </div>
          {err&&<div style={{color:T.red,background:T.redDim,border:`1px solid ${T.red}`,
            borderRadius:6,padding:'8px 12px',fontSize:12,marginBottom:12}}>{err}</div>}
        </div>}

        <div style={{display:'flex',justifyContent:'space-between',marginTop:20,
          paddingTop:16,borderTop:`1px solid ${T.border}`}}>
          <Btn variant="ghost" onClick={()=>step>1?setStep(s=>s-1):nav('dashboard')}>← Назад</Btn>
          {step<6
            ?<Btn onClick={next}>Далее →</Btn>
            :<Btn onClick={analyze} disabled={loading} style={{minWidth:160,justifyContent:'center'}}>
              {loading?'Анализируем...':'🔍 Запустить анализ'}
            </Btn>}
        </div>
      </Card>

      {loading&&(
        <Card style={{marginTop:14,padding:24,border:`1px solid ${T.borderStr}`}}>
          <div style={{textAlign:'center',marginBottom:16}}>
            <div style={{fontSize:28,marginBottom:8}}>⚡</div>
            <div style={{fontWeight:700,fontSize:14}}>Анализ запущен</div>
            <div style={{color:T.textDim,fontSize:12}}>OpenSanctions + DeepSeek AI · обычно 15–30 сек</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {LOADING_STEPS.map((l,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',
                borderRadius:6,background:loadStep>=i?T.blueDim:T.surf2,
                border:`1px solid ${loadStep>=i?T.borderStr:T.border}`,fontSize:12}}>
                <span style={{color:loadStep>i?T.green:loadStep===i?T.blue:T.textSub,
                  fontSize:14,width:18,flexShrink:0}}>
                  {loadStep>i?'✓':loadStep===i?'⟳':'○'}
                </span>
                <span style={{color:loadStep>=i?T.text:T.textDim}}>{l}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── RESULT ────────────────────────────────────────────────────
function Result({nav,result,toast,setPrefillMonitor}:any){
  const [tab,setTab]=useState('analysis');
  const [showFlagModal,setShowFlagModal]=useState(false);
  const v=VERDICT[result.verdict]??VERDICT.CAUTION;
  const sc=riskColor;  // alias for backward compat inside Result
  const cr=result.checkRecord;
  const sanctionsHits=result.sanctionsHits?.counterparty;

  const downloadPDF=async()=>{
    if(!cr?.id){toast('Нет ID для скачивания','error');return;}
    try{await apiDownloadPDF(cr.id,`aegis_check_${cr.id}.pdf`);toast('PDF скачан');}
    catch{toast('Ошибка генерации PDF','error');}
  };

  const radarData=Object.entries(result.modules??{}).map(([k,m]:any)=>({
    subject:MODULE_LABELS[k]??k,score:m.score??0,
  }));

  return(
    <div style={{padding:'28px 32px',maxWidth:860}}>
      <span onClick={()=>nav('dashboard')} style={{color:T.textDim,cursor:'pointer',fontSize:12,marginBottom:16,display:'block'}}>← Назад</span>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',
        flexWrap:'wrap',gap:12,marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,marginBottom:4,letterSpacing:'-0.5px'}}>Результат проверки</h1>
          <div style={{fontSize:12,color:T.textDim,fontFamily:T.mono}}>
            ID: {cr?.id??'—'} · {cr?.date?fmtDateTime(cr.date):'—'}
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Btn variant="ghost" size="sm" onClick={()=>nav('check')}>+ Новая</Btn>
          <LoadingBtn variant="ghost" size="sm"
              onClick={downloadPDF} loadingText="Генерация..."
              onError={(e:string)=>toast(e,'error')}>⬇ PDF</LoadingBtn>
          {(result.verdict==='CAUTION'||result.verdict==='BLOCKED')&&(
            <Btn variant="secondary" size="sm" onClick={()=>setShowFlagModal(true)}>
              📋 На проверку
            </Btn>
          )}
          <Btn variant="success" size="sm" onClick={()=>{
            setPrefillMonitor?.({name:cr?.counterparty??'',country:cr?.country??''});
            nav('monitoring');
          }}>◎ Watch-list</Btn>
        </div>
      </div>

      {/* Verdict banner */}
      <Card style={{padding:24,marginBottom:16,border:`2px solid ${v.c}`,background:v.bg}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          gap:20,flexWrap:'wrap'}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <span style={{fontSize:22,fontWeight:900,color:v.c}}>{v.icon}</span>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:v.c,letterSpacing:'-0.4px',lineHeight:1.2}}>
                  {v.label}
                </div>
                <div style={{fontSize:12,color:T.textDim,marginTop:2}}>{v.sub}</div>
              </div>
            </div>
            <div style={{fontSize:13,color:T.textDim,lineHeight:1.7,marginTop:8}}>{result.summary}</div>
            {result.screeningMetadata?.opensanctions?.serviceAvailable===false&&(
              <div style={{marginTop:10,background:T.amberDim,border:`1px solid ${T.amber}`,
                borderRadius:6,padding:'8px 12px',fontSize:11,color:T.amber,lineHeight:1.5}}>
                ⚠ <strong>Санкционный скрининг не выполнен</strong> — OpenSanctions был недоступен.
                Результат основан только на AI-анализе. Рекомендуется повторить проверку.
              </div>
            )}
            {/* Compliance disclaimer — mandatory for decision support tools */}
            <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${v.c}40`,
              fontSize:11,color:T.textSub,lineHeight:1.6}}>
              Результат является инструментом поддержки принятия решений и не представляет собой
              юридического заключения. Окончательное решение принимается уполномоченным
              комплаенс-офицером на основе полного комплекта документов по сделке.
            </div>
          </div>
          <div style={{textAlign:'center',flexShrink:0}}>
            <ScoreGauge score={result.score??0}/>
            <div style={{fontSize:9,color:T.textSub,marginTop:4}}>AI-assisted</div>
          </div>
          <div><Badge level={result.overall}/></div>
        </div>
      </Card>

      {/* Real sanctions hits */}
      {sanctionsHits&&(sanctionsHits.isSanctioned||sanctionsHits.isHighRisk)&&(
        <Card style={{padding:16,marginBottom:16,
          border:`1px solid ${sanctionsHits.isSanctioned?T.red:T.amber}`}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10,
            color:sanctionsHits.isSanctioned?T.red:T.amber}}>
            {sanctionsHits.isSanctioned
              ?'⚠ ПОДТВЕРЖДЁННОЕ САНКЦИОННОЕ СОВПАДЕНИЕ (OpenSanctions)'
              :'⚡ Возможное совпадение в санкционных списках'}
          </div>
          {sanctionsHits.hits.slice(0,2).map((h:any,i:number)=>(
            <div key={i} style={{background:T.surf2,borderRadius:7,padding:'10px 14px',marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{h.caption}</div>
              <div style={{fontSize:11,color:T.textDim,display:'flex',gap:16,flexWrap:'wrap'}}>
                <span>Списки: <strong style={{color:T.text}}>{h.sanctionedBy?.join(', ')||'—'}</strong></span>
                <span>Тип: <strong style={{color:T.text}}>{h.schema}</strong></span>
                <span>Совпадение: <strong style={{color:sc(h.score*100)}}>{Math.round(h.score*100)}%</strong></span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:`1px solid ${T.border}`}}>
        {[{id:'analysis',l:'Анализ'},{id:'radar',l:'Радар рисков'},{id:'norms',l:'Нормы'},{id:'methodology',l:'Методология 🔍'}].map(t=>(
          <div key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'8px 16px',fontSize:13,cursor:'pointer',
            fontWeight:tab===t.id?700:500,
            color:tab===t.id?T.blue:T.textDim,
            borderBottom:`2px solid ${tab===t.id?T.blue:'transparent'}`,marginBottom:-1}}>
            {t.l}
          </div>
        ))}
      </div>

      {tab==='analysis'&&<>
        {/* AI Confidence notice — shown when our deterministic score diverges significantly from AI */}
        {result.aiSuggestedScore&&Math.abs((result.aiSuggestedScore??0)-(result.score??0))>15&&(
          <div style={{background:T.amberDim,border:`1px solid ${T.amber}`,borderRadius:7,
            padding:'9px 14px',fontSize:12,color:T.amber,marginBottom:12,display:'flex',gap:8}}>
            <span style={{flexShrink:0}}>ℹ</span>
            <span>AI предложил скор {result.aiSuggestedScore}, детерминированный расчёт: {result.score}.
              Расхождение &gt;15 — рекомендуется ручная проверка. Откройте вкладку «Методология».</span>
          </div>
        )}
        {result.red_flags?.length>0&&(
          <Card style={{padding:16,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:T.red}}>
              ⚠ Риск-факторы ({result.red_flags.length})
            </div>
            {result.red_flags.map((f:string,i:number)=>(
              <div key={i} style={{display:'flex',gap:10,padding:'7px 0',
                borderBottom:`1px solid ${T.border}`,fontSize:13}}>
                <span style={{color:T.red,flexShrink:0}}>•</span>
                <span style={{color:T.textDim}}>{f}</span>
              </div>
            ))}
          </Card>
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,marginBottom:14}}>
          {Object.entries(result.modules??{}).map(([k,m]:any)=>{
            const col=sc(m.score??0);
            return(
              <Card key={k} style={{padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <div style={{fontWeight:600,fontSize:13}}>{MODULE_LABELS[k]??k}</div>
                  <Badge level={m.risk}/>
                </div>
                <ScoreBar score={m.score??0} color={col}/>
                {(m.findings??[]).map((fd:string,i:number)=>(
                  <div key={i} style={{fontSize:12,color:T.textDim,padding:'3px 0',display:'flex',gap:6}}>
                    <span style={{color:col,flexShrink:0}}>•</span>{fd}
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
        {result.recs?.length>0&&(
          <Card style={{padding:18}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>💡 Рекомендации</div>
            {result.recs.map((r:string,i:number)=>(
              <div key={i} style={{display:'flex',gap:12,padding:'8px 0',
                borderBottom:`1px solid ${T.border}`,fontSize:13}}>
                <span style={{color:T.blue,fontWeight:700,flexShrink:0,fontFamily:T.mono,fontSize:11}}>
                  {String(i+1).padStart(2,'0')}
                </span>
                <span style={{color:T.textDim}}>{r}</span>
              </div>
            ))}
          </Card>
        )}
      </>}

      {tab==='radar'&&(
        <Card style={{padding:24}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Профиль риска по модулям</div>
          <div style={{color:T.textDim,fontSize:12,marginBottom:20}}>
            Площадь радара = совокупный риск. Идеал — минимальная площадь.
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} margin={{top:10,right:30,bottom:10,left:30}}>
              <PolarGrid stroke={T.border}/>
              <PolarAngleAxis dataKey="subject" tick={{fill:T.textDim,fontSize:11}}/>
              <Radar name="Риск" dataKey="score" stroke={T.red} fill={T.red} fillOpacity={0.15} strokeWidth={2}/>
            </RadarChart>
          </ResponsiveContainer>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
            {radarData.map((d:any)=>(
              <div key={d.subject} style={{textAlign:'center',flex:1,minWidth:80}}>
                <div style={{fontFamily:T.mono,fontSize:18,fontWeight:700,color:sc(d.score)}}>{d.score}</div>
                <div style={{fontSize:10,color:T.textSub}}>{String(d.subject).replace(/^[^\s]+ /,'')}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab==='norms'&&(
        <Card style={{padding:20}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Применимые нормы и регуляторная база</div>
          <div style={{fontSize:12,color:T.textDim,marginBottom:14}}>
            AI-система определила следующие нормативные акты как потенциально применимые к данной сделке.
            Требует верификации квалифицированным юристом.
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:20}}>
            {(result.norms??[]).map((n:string,i:number)=>(
              <span key={i} style={{background:T.blueDim,color:T.blue,padding:'5px 12px',
                borderRadius:6,fontSize:12,fontWeight:600,border:`1px solid ${T.borderStr}`}}>{n}</span>
            ))}
          </div>
          {sanctionsHits&&(
            <div>
              <div style={{fontWeight:600,fontSize:12,color:T.textDim,marginBottom:8}}>БАЗЫ ДАННЫХ (OpenSanctions)</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {(sanctionsHits.datasetsChecked??[]).map((d:string,i:number)=>(
                  <span key={i} style={{background:T.surf2,color:T.textDim,padding:'4px 10px',
                    borderRadius:6,fontSize:11,border:`1px solid ${T.border}`}}>✓ {d}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {tab==='methodology'&&(
        <div>
          {/* Score Breakdown Table */}
          <Card style={{padding:20,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Расчёт риск-скора</div>
            <div style={{color:T.textDim,fontSize:12,marginBottom:16,lineHeight:1.6}}>
              Скор рассчитывается детерминированно — не AI «угадывает», а взвешенная сумма оценок по каждому модулю. Полностью аудируемо.
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${T.borderStr}`}}>
                  {['Модуль','Скор','Вес','Вклад'].map(h=>(
                    <th key={h} style={{padding:'6px 12px',textAlign:'left',fontSize:11,color:T.textSub,fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              {/* Weight rationale */}
              <div style={{fontSize:11,color:T.textSub,marginBottom:10,lineHeight:1.5,
                padding:'6px 10px',background:T.surf2,borderRadius:5}}>
                Веса отражают relative severity для compliance: санкции (35%) — прямой правовой блокер,
                экспортный контроль (25%) — уголовная ответственность, UBO (20%) — правило 50% OFAC.
              </div>
              <tbody>
                {result.scoreBreakdown
                  ? Object.entries(result.scoreBreakdown).map(([k,v]:any)=>(
                    <tr key={k} style={{borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:'8px 12px',fontSize:13}}>{MODULE_LABELS[k]??k}</td>
                      <td style={{padding:'8px 12px',fontFamily:T.mono,fontWeight:700,color:sc(v.score)}}>{v.score}</td>
                      <td style={{padding:'8px 12px',color:T.textDim}}>{(v.weight*100).toFixed(0)}%</td>
                      <td style={{padding:'8px 12px',fontFamily:T.mono,color:T.textDim}}>{v.contribution.toFixed(1)}</td>
                    </tr>
                  ))
                  : <tr><td colSpan={4} style={{padding:'8px 12px',color:T.textSub,fontSize:12}}>Детализация недоступна для этой проверки</td></tr>
                }
              </tbody>
              <tfoot>
                <tr style={{borderTop:`2px solid ${T.borderStr}`}}>
                  <td style={{padding:'8px 12px',fontWeight:700,fontSize:13}} colSpan={3}>Итоговый взвешенный скор</td>
                  <td style={{padding:'8px 12px',fontFamily:T.mono,fontWeight:900,fontSize:16,color:sc(result.score??0)}}>{result.score??'—'}</td>
                </tr>
                {result.aiSuggestedScore&&result.aiSuggestedScore!==result.score&&(
                  <tr>
                    <td colSpan={4} style={{padding:'4px 12px',fontSize:11,color:T.textSub}}>
                      AI предложил: {result.aiSuggestedScore} · Наш расчёт: {result.score}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </Card>

          {/* OpenSanctions — Data provenance + coverage/limitations */}
          <Card style={{padding:20,marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:13}}>OpenSanctions — Источник данных</div>
              <a href="https://opensanctions.org" target="_blank" rel="noopener noreferrer"
                style={{fontSize:11,color:T.blue,textDecoration:'none'}}>opensanctions.org ↗</a>
            </div>
            {/* Coverage & freshness */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
              {[
                {label:'Обновление данных',value:'Ежедневно (OFAC), еженедельно (EU)'},
                {label:'Лицензия',value:'ODC-BY (открытые данные)'},
                {label:'Всего баз данных',value:'50+ официальных источников'},
                {label:'Метод запроса',value:'REST API (real-time, не кешируется)'},
              ].map(item=>(
                <div key={item.label} style={{background:T.surf2,borderRadius:7,padding:'9px 12px'}}>
                  <div style={{fontSize:10,color:T.textSub,marginBottom:3}}>{item.label}</div>
                  <div style={{fontSize:12,fontWeight:600,color:T.text}}>{item.value}</div>
                </div>
              ))}
            </div>
            {result.screeningMetadata?.opensanctions ? (()=>{
              const os=result.screeningMetadata!.opensanctions;
              return(
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
                    {[
                      {label:'Запрос',value:os.searched},
                      {label:'Время ответа',value:`${os.latencyMs} мс`,mono:true},
                      {label:'Хиты',value:`${os.totalHits} совпадений`,color:os.totalHits>0?T.amber:T.green},
                    ].map(item=>(
                      <div key={item.label} style={{background:T.surf2,borderRadius:7,padding:'10px 14px'}}>
                        <div style={{fontSize:10,color:T.textSub,marginBottom:4}}>{item.label}</div>
                        <div style={{fontSize:13,fontWeight:600,fontFamily:item.mono?T.mono:undefined,color:item.color??T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{fontSize:11,color:T.textSub,marginBottom:8,fontWeight:600}}>ПРОВЕРЕННЫЕ БАЗЫ</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {(os.datasetsChecked??[]).map((d:string,i:number)=>(
                        <span key={i} style={{
                          background:os.totalHits>0&&i===0?T.amberDim:T.surf2,
                          color:os.totalHits>0&&i===0?T.amber:T.green,
                          border:`1px solid ${os.totalHits>0&&i===0?T.amber:T.border}`,
                          padding:'3px 10px',borderRadius:5,fontSize:11,fontWeight:600}}>
                          ✓ {d}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!os.serviceAvailable&&(
                    <div style={{marginTop:12,background:T.amberDim,border:`1px solid ${T.amber}`,borderRadius:6,padding:'8px 12px',fontSize:12,color:T.amber}}>
                      ⚠ OpenSanctions был недоступен в момент проверки — скрининг не выполнен. Рекомендуется повторная проверка.
                    </div>
                  )}
                </div>
              );
            })():(
              <div style={{color:T.textSub,fontSize:12}}>Метаданные скрининга недоступны для этой проверки</div>
            )}
            {/* What is NOT covered — intellectual honesty builds trust */}
            <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontSize:11,color:T.textSub,fontWeight:600,marginBottom:8,letterSpacing:'0.5px'}}>
                ЧТО НЕ ПОКРЫВАЕТ ДАННЫЙ СКРИНИНГ
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                {[
                  '⚠ Уголовные дела и приговоры (ФСИН, Интерпол)',
                  '⚠ Нац. санкц. списки малых государств',
                  '⚠ Отраслевые банковские blacklists',
                  '⚠ Неформальные сети аффилированности',
                  '⚠ Сведения из ЕГРЮЛ / ФНС (требует отдельный запрос)',
                  '⚠ Adverse media / репутационные риски',
                ].map((item,i)=>(
                  <div key={i} style={{fontSize:11,color:T.textSub,padding:'4px 0',
                    display:'flex',gap:6,alignItems:'flex-start'}}>
                    <span style={{color:T.amber,flexShrink:0,marginTop:1}}>!</span>
                    <span>{item.replace('⚠ ','')}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:10,fontSize:11,color:T.textSub,lineHeight:1.6,
                padding:'8px 10px',background:T.surf2,borderRadius:5}}>
                Для полноценного due diligence рекомендуется дополнять проверку запросами
                в ЕГРЮЛ, adverse media-скринингом и отраслевыми базами.
              </div>
            </div>
          </Card>

          {/* AI metadata */}
          <Card style={{padding:20,marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>AI-анализ — метаданные</div>
            {result.screeningMetadata?.ai ? (()=>{
              const ai=result.screeningMetadata!.ai;
              return(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  {[
                    {label:'Модель',value:ai.model},
                    {label:'Время анализа',value:`${ai.latencyMs} мс`,mono:true},
                    {label:'Всего время',value:`${result.screeningMetadata!.totalLatencyMs} мс`,mono:true},
                  ].map(item=>(
                    <div key={item.label} style={{background:T.surf2,borderRadius:7,padding:'10px 14px'}}>
                      <div style={{fontSize:10,color:T.textSub,marginBottom:4}}>{item.label}</div>
                      <div style={{fontSize:13,fontWeight:600,fontFamily:item.mono?T.mono:undefined}}>{item.value}</div>
                    </div>
                  ))}
                </div>
              );
            })():(
              <div style={{color:T.textSub,fontSize:12}}>Метаданные AI недоступны для этой проверки</div>
            )}
          </Card>

          {/* Audit Trail */}
          <Card style={{padding:20}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Audit Trail</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <tbody>
                {([
                  ['Check ID',cr?.id,'mono'],
                  ['Создан',cr?.date?fmtDateTime(cr.date):undefined],
                  ['Контрагент',cr?.counterparty],
                  ['Страна',cr?.country],
                  ['Источник','manual'],
                ] as [string,string|undefined,string?][]).map(([k,v,mono])=>v?(
                  <tr key={k} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:'7px 12px',color:T.textDim,fontSize:12,width:140}}>{k}</td>
                    <td style={{padding:'7px 12px',fontFamily:mono?T.mono:undefined,fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',maxWidth:320}}>{v}</td>
                  </tr>
                ):null)}
              </tbody>
            </table>
            <div style={{marginTop:14,background:T.surf2,borderRadius:6,padding:'10px 14px',fontSize:11,color:T.textSub,lineHeight:1.6}}>
              Данный отчёт является инструментом поддержки compliance-решений (decision support tool).
            Дата, ID и результаты скрининга фиксируются в момент создания и не изменяются.
            Может использоваться как evidence trail при прохождении KYC по 115-ФЗ.
            Не является юридическим заключением.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── HISTORY ───────────────────────────────────────────────────
function History({nav,history,setResult,toast,deleteCheck,rerunCheck}:any){
  const [filter,setFilter]=useState('ALL');
  const [search,setSearch]=useState('');
  const [delId,setDelId]=useState<string|null>(null);
  const sc=riskColor;

  const filtered=history.filter((h:any)=>{
    if(filter!=='ALL'&&h.result?.overall!==filter)return false;
    if(search){
      const q=search.toLowerCase();
      if(!h.counterparty?.toLowerCase().includes(q)&&
         !h.country?.toLowerCase().includes(q)&&
         !h.form?.product?.toLowerCase().includes(q))return false;
    }
    return true;
  });

  return(
    <div style={{padding:'28px 32px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,letterSpacing:'-0.5px'}}>История проверок</h1>
          <p style={{color:T.textDim,fontSize:13,marginTop:4}}>{history.length} проверок</p>
        </div>
        {history.length>0&&(
          <Btn variant="secondary" size="sm"
            onClick={async()=>{try{await apiExportCSV();}catch(e:any){toast(e.message??'Ошибка экспорта','error');}}} loadingText='Экспорт...'>
            ⬇ Экспорт CSV
          </Btn>
        )}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={(e:any)=>setSearch(e.target.value)}
          placeholder="Поиск по контрагенту, стране, товару..."
          style={{flex:1,minWidth:200,background:T.surf2,border:`1px solid ${T.border}`,
            borderRadius:7,padding:'8px 12px',color:T.text,fontSize:13,outline:'none'}}/>
        {['ALL','LOW','MEDIUM','HIGH'].map(f=>(
          <div key={f} onClick={()=>setFilter(f)} style={{
            padding:'7px 14px',borderRadius:7,fontSize:12,cursor:'pointer',fontWeight:600,
            background:filter===f?T.surf3:T.surf2,
            color:filter===f?T.text:T.textDim,
            border:`1px solid ${filter===f?T.borderStr:T.border}`}}>
            {f==='ALL'?`Все (${history.length})`:(RISK[f]?.label??f)}
          </div>
        ))}
      </div>

      {!filtered.length?(
        <Card style={{textAlign:'center',padding:56}}>
          {history.length?(
            <>
              <div style={{fontSize:36,marginBottom:12}}>🔎</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>Ничего не найдено</div>
              <p style={{color:T.textDim,fontSize:13}}>Попробуйте изменить фильтр или поисковый запрос</p>
              <Btn variant="ghost" style={{marginTop:14}} onClick={()=>{setSearch('');setFilter('ALL');}}>
                Сбросить фильтры
              </Btn>
            </>
          ):(
            <>
              <div style={{fontSize:36,marginBottom:12}}>📋</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>История проверок пуста</div>
              <p style={{color:T.textDim,fontSize:13,maxWidth:360,margin:'0 auto 20px',lineHeight:1.6}}>
                Запустите первую проверку сделки — реальный скрининг OFAC, EU, UN + AI-анализ за 30 секунд
              </p>
              <Btn onClick={()=>nav('check')}>Запустить первую проверку →</Btn>
            </>
          )}
        </Card>
      ):(
        <Card>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {['Контрагент','Страна','Товар','Санкции','Вердикт','Скор','Дата','Обзор',''].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,
                    color:T.textSub,fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h:any,i:number)=>{
                const sanctioned=h.sanctionsHits?.counterparty?.isSanctioned;
                const highRisk=h.sanctionsHits?.counterparty?.isHighRisk;
                return delId===h.id?(
                  <tr key={i} style={{background:T.redDim}}>
                    <td colSpan={8} style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontSize:13,color:T.amber}}>⚠ Удалить «{h.counterparty}»? Необратимо.</span>
                        <div style={{display:'flex',gap:8}}>
                          <Btn variant="danger" size="sm" onClick={()=>{deleteCheck(h.id);setDelId(null);}}>Удалить</Btn>
                          <Btn variant="ghost" size="sm" onClick={()=>setDelId(null)}>Отмена</Btn>
                        </div>
                      </div>
                    </td>
                  </tr>
                ):(
                  <tr key={i} style={{borderBottom:`1px solid ${T.border}`,cursor:'pointer'}}
                    onMouseEnter={(e:any)=>e.currentTarget.style.background=T.surf2}
                    onMouseLeave={(e:any)=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'11px 16px',fontSize:13,fontWeight:600}}>{h.counterparty}</td>
                    <td style={{padding:'11px 16px',fontSize:12,color:T.textDim}}>{h.country}</td>
                    <td style={{padding:'11px 16px',fontSize:12,color:T.textDim,maxWidth:140,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {h.form?.product??h.product??'—'}
                    </td>
                    <td style={{padding:'11px 16px'}}>
                      {sanctioned
                        ?<span style={{background:T.redDim,color:T.red,padding:'2px 7px',
                          borderRadius:4,fontSize:10,fontWeight:700}}>HIT</span>
                        :highRisk
                        ?<span style={{background:T.amberDim,color:T.amber,padding:'2px 7px',
                          borderRadius:4,fontSize:10,fontWeight:700}}>⚡</span>
                        :<span style={{color:T.textSub,fontSize:11}}>—</span>}
                    </td>
                    <td style={{padding:'11px 16px'}}><VerdictBadge verdict={h.result?.verdict}/></td>
                    <td style={{padding:'11px 16px',fontFamily:T.mono,fontSize:13,
                      color:riskColor(h.score??0)}}>
                      {h.score??'—'}
                    </td>
                    <td style={{padding:'11px 16px',fontSize:11,color:T.textSub,whiteSpace:'nowrap'}}>
                      {fmtDate(h.date)}
                    </td>
                    <td style={{padding:'11px 16px'}}>
                      {/* Review status badge — shown if check was flagged */}
                      {h.review&&(
                        <span style={{background:(REVIEW_STATUS[h.review.status]?.bg??T.surf2),
                          color:(REVIEW_STATUS[h.review.status]?.c??T.textDim),
                          padding:'2px 7px',borderRadius:20,fontSize:10,fontWeight:700}}>
                          {REVIEW_STATUS[h.review.status]?.label??h.review.status}
                        </span>
                      )}
                    </td>
                    <td style={{padding:'11px 16px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <Btn variant="ghost" size="sm"
                          onClick={()=>{setResult(h.result);nav('result');}}>Открыть</Btn>
                        <Btn variant="ghost" size="sm" onClick={()=>rerunCheck(h.form)}>↻</Btn>
                        <Btn variant="ghost" size="sm" style={{color:T.red}}
                          onClick={()=>setDelId(h.id)}>✕</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── DOCUMENTS ─────────────────────────────────────────────────
function Documents({nav,toast,setPrefillForm}:any){
  const [docs,setDocs]=useState<ApiDocument[]>([]);
  const [uploading,setUploading]=useState(false);
  const [dragging,setDragging]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);

  const [loadingDocs,setLoadingDocs]=useState(true);

  const load=useCallback(()=>{
    apiListDocuments()
      .then(d=>setDocs(d.data))
      .catch(()=>{})
      .finally(()=>setLoadingDocs(false));
  },[]);

  useEffect(()=>{load();},[load]);

  // Auto-poll every 3s while any document is still processing
  const hasProcessing=docs.some(d=>d.status==='pending'||d.status==='processing');
  useInterval(load, hasProcessing ? 3000 : null);

  const upload=async(file:File)=>{
    setUploading(true);
    try{
      await apiUploadDocumentRaw(file);
      toast('Документ загружен — извлекаем данные...');
      load();
    }catch(e:any){toast('Ошибка: '+(e.message??''),'error');}
    finally{setUploading(false);}
  };

  const onDrop=(e:any)=>{
    e.preventDefault();setDragging(false);
    const file=e.dataTransfer.files?.[0];
    if(file)upload(file);
  };

  const useExtracted=(doc:ApiDocument)=>{
    if(!doc.extracted){toast('Данные ещё не извлечены','info');return;}
    const e=doc.extracted;
    setPrefillForm({cp:e.counterparty??'',country:e.country??'',product:e.product??'',
      tnved:e.tnved??'',currency:e.currency??'',val:e.value??'',bank:e.bank??''});
    nav('check');
  };

  const stColor=(s:string)=>s==='done'?T.green:s==='error'?T.red:T.amber;
  const stLabel=(s:string):string=>({'pending':'Ожидание','processing':'Обработка...','done':'Готово','error':'Ошибка'}[s]??s);

  return(
    <div style={{padding:'28px 32px'}}>
      <h1 style={{fontSize:20,fontWeight:800,marginBottom:4,letterSpacing:'-0.5px'}}>Документы</h1>
      <p style={{color:T.textDim,fontSize:13,marginBottom:24}}>
        Загрузите контракт, инвойс или накладную — Aegis автоматически извлечёт контрагента, ТН ВЭД и запустит проверку
      </p>

      <Card style={{padding:40,textAlign:'center',marginBottom:24,cursor:'pointer',
        border:`2px dashed ${dragging?T.blue:T.border}`,background:dragging?T.blueDim:T.surf}}
        onClick={()=>fileRef.current?.click()}>
        <div onDragOver={(e)=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)} onDrop={onDrop}>
          <div style={{fontSize:40,marginBottom:12}}>↑</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>
            {uploading?'Загружаем...':'Перетащите файл или нажмите'}
          </div>
          <div style={{color:T.textDim,fontSize:13}}>PDF, DOCX, TXT · Максимум 10 MB</div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{display:'none'}}
            onChange={(e:any)=>e.target.files?.[0]&&upload(e.target.files[0])}/>
        </div>
      </Card>

      {loadingDocs?(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[0,1,2].map(i=><SkeletonCard key={i} lines={2}/>)}
        </div>
      ):docs.length===0?(
        <Card style={{textAlign:'center',padding:48}}>
          <div style={{fontSize:36,marginBottom:12}}>📄</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Загруженных документов нет</div>
          <p style={{color:T.textDim,fontSize:13,maxWidth:360,margin:'0 auto 20px',lineHeight:1.6}}>
            Загрузите контракт, инвойс или CMR-накладную — Aegis автоматически извлечёт контрагента,
            ТН ВЭД и сумму сделки
          </p>
          <Btn onClick={()=>fileRef.current?.click()}>↑ Загрузить первый документ</Btn>
        </Card>
      ):(
        <Card>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {['Документ','Размер','Статус','Извлечено','Дата',''].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:T.textSub,fontWeight:600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map(doc=>(
                <tr key={doc.id} style={{borderBottom:`1px solid ${T.border}`}}
                  onMouseEnter={(e:any)=>e.currentTarget.style.background=T.surf2}
                  onMouseLeave={(e:any)=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{fontWeight:600,fontSize:13}}>{doc.originalName}</div>
                    <div style={{fontSize:11,color:T.textSub}}>{doc.mimeType.split('/')[1]?.toUpperCase()}</div>
                  </td>
                  <td style={{padding:'12px 16px',fontSize:12,color:T.textDim,fontFamily:T.mono}}>
                    {(doc.sizeBytes/1024).toFixed(0)} KB
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{background:`${stColor(doc.status)}20`,color:stColor(doc.status),
                      padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,
                      display:'inline-flex',alignItems:'center',gap:5}}>
                      {(doc.status==='pending'||doc.status==='processing')&&(
                        <span style={{width:8,height:8,borderRadius:'50%',
                          border:`2px solid currentColor`,borderTopColor:'transparent',
                          animation:'aegis-spin 0.8s linear infinite',flexShrink:0,display:'inline-block'}}/>
                      )}
                      {stLabel(doc.status)}
                    </span>
                  </td>
                  <td style={{padding:'12px 16px',fontSize:12,color:T.textDim}}>
                    {doc.extracted?Object.values(doc.extracted).filter(Boolean).length+' полей':'—'}
                  </td>
                  <td style={{padding:'12px 16px',fontSize:11,color:T.textSub}}>
                    {fmtDate(doc.createdAt)}
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{display:'flex',gap:6}}>
                      {doc.status==='done'&&doc.extracted&&(
                        <Btn size="sm" onClick={()=>useExtracted(doc)}>→ Проверить</Btn>
                      )}
                      <Btn variant="ghost" size="sm" style={{color:T.red}}
                        onClick={async()=>{await apiDeleteDocument(doc.id);load();}}>✕</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── MONITORING ────────────────────────────────────────────────
function Monitoring({toast,setAlertCount,prefillMonitor,clearMonitorPrefill}:any){
  const [monitors,setMonitors]=useState<ApiMonitor[]>([]);
  const [adding,setAdding]=useState(false);
  const [name,setName]=useState('');const [country,setCountry]=useState('');
  const [loading,setLoading]=useState(false);

  // Pre-fill from "Add to monitoring" button on Result page
  useEffect(()=>{
    if(prefillMonitor){
      setName(prefillMonitor.name??'');
      setCountry(prefillMonitor.country??'');
      setAdding(true);
      clearMonitorPrefill?.();
    }
  },[prefillMonitor]); // eslint-disable-line

  const load=useCallback(()=>{
    apiListMonitors().then(data=>{
      setMonitors(data);
      setAlertCount(data.filter(m=>m.hasUnreadAlert).length);
    }).catch(()=>{});
  },[setAlertCount]);

  useEffect(()=>{load();},[load]);

  const add=async()=>{
    if(!name.trim())return;
    setLoading(true);
    try{
      await apiCreateMonitor({entityName:name.trim(),entityCountry:country||undefined});
      toast('Добавлено в watch-list');setName('');setCountry('');setAdding(false);load();
    }catch{toast('Ошибка добавления','error');}
    finally{setLoading(false);}
  };

  const [recheckingId,setRecheckingId]=useState<string|null>(null);
  const recheck=async(id:string)=>{
    setRecheckingId(id);
    try{
      await apiRecheckMonitor(id);
      load();
      toast('Скрининг обновлён');
    }catch(e:any){
      toast(e.message??'Ошибка перепроверки','error');
    }finally{
      setRecheckingId(null);
    }
  };

  const alertColor=(l:string|null)=>l==='high'?T.red:l==='medium'?T.amber:l==='low'?T.blue:T.textSub;

  return(
    <div style={{padding:'28px 32px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,letterSpacing:'-0.5px'}}>Мониторинг контрагентов</h1>
          <p style={{color:T.textDim,fontSize:13,marginTop:4}}>Watch-list — отслеживание санкционного статуса</p>
        </div>
        <Btn onClick={()=>setAdding(true)}>+ Добавить</Btn>
      </div>

      {adding&&(
        <Card style={{padding:20,marginBottom:16,border:`1px solid ${T.borderStr}`}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Добавить в watch-list</div>
          <div style={{fontSize:12,color:T.textDim,marginBottom:14}}>
            При добавлении будет выполнен первичный скрининг OpenSanctions.
            Статус будет обновляться при ручном запуске или при плановой перепроверке.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Inp label="Наименование *" value={name} onChange={setName} placeholder="ACME Trading Co."/>
            <Sel label="Страна" value={country} onChange={setCountry} options={COUNTRIES}/>
          </div>
          {loading&&(
            <div style={{background:T.blueDim,border:`1px solid ${T.borderStr}`,
              borderRadius:6,padding:'9px 12px',fontSize:12,color:T.blue,marginBottom:10}}>
              ⚡ Выполняем скрининг по OpenSanctions (OFAC, EU, UN, UK, BIS)...
            </div>
          )}
          <div style={{display:'flex',gap:8}}>
            <LoadingBtn onClick={add} disabled={!name.trim()}
              loadingText="Проверяем по OpenSanctions...">
              Добавить и проверить
            </LoadingBtn>
            <Btn variant="ghost" onClick={()=>setAdding(false)}>Отмена</Btn>
          </div>
        </Card>
      )}

      {monitors.length===0?(
        <Card style={{textAlign:'center',padding:56}}>
          <div style={{fontSize:36,marginBottom:12}}>◎</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Watch-list пуст</div>
          <p style={{color:T.textDim,fontSize:13,maxWidth:400,margin:'0 auto 8px',lineHeight:1.6}}>
            Добавьте контрагентов для непрерывного мониторинга санкционного статуса.
            При изменении статуса вы получите алерт.
          </p>
          <p style={{color:T.textSub,fontSize:11,marginBottom:20}}>
            Проверка по OpenSanctions выполняется автоматически при добавлении
          </p>
          <Btn onClick={()=>setAdding(true)}>+ Добавить первого контрагента</Btn>
        </Card>
      ):(
        <Card>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {['Контрагент','Страна','Алерт','Риск-скор','Проверено',''].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:T.textSub,fontWeight:600}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monitors.map(m=>(
                <tr key={m.id} style={{borderBottom:`1px solid ${T.border}`,
                  background:m.hasUnreadAlert?`${T.red}08`:'transparent'}}
                  onMouseEnter={(e:any)=>e.currentTarget.style.background=T.surf2}
                  onMouseLeave={(e:any)=>e.currentTarget.style.background=m.hasUnreadAlert?`${T.red}08`:'transparent'}>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{fontWeight:600,fontSize:13}}>{m.entityName}</div>
                    {m.alertMessage&&<div style={{fontSize:11,color:alertColor(m.alertLevel),marginTop:2}}>{m.alertMessage}</div>}
                  </td>
                  <td style={{padding:'12px 16px',fontSize:12,color:T.textDim}}>{m.entityCountry??'—'}</td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{background:`${alertColor(m.alertLevel)}20`,color:alertColor(m.alertLevel),
                      padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700}}>
                      {m.alertLevel==='high'?'⚠ HIGH':m.alertLevel==='medium'?'⚡ MED':'✓ OK'}
                    </span>
                  </td>
                  <td style={{padding:'12px 16px',fontFamily:T.mono,fontSize:13,
                    color:m.lastRiskScore!=null?(m.lastRiskScore<30?T.green:m.lastRiskScore<60?T.amber:T.red):T.textSub}}>
                    {m.lastRiskScore??'—'}
                  </td>
                  <td style={{padding:'12px 16px',fontSize:11,color:T.textSub}}>
                    {m.lastCheckedAt?fmtDateTime(m.lastCheckedAt):'—'}
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <div style={{display:'flex',gap:6}}>
                      <Btn variant="ghost" size="sm"
                        disabled={recheckingId===m.id}
                        onClick={()=>recheck(m.id)}>
                        {recheckingId===m.id?(
                          <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
                            <span style={{width:10,height:10,border:'2px solid currentColor',
                              borderTopColor:'transparent',borderRadius:'50%',
                              animation:'aegis-spin 0.7s linear infinite',display:'inline-block'}}/>
                          </span>
                        ):'↻'}
                      </Btn>
                      {m.hasUnreadAlert&&(
                        <Btn variant="ghost" size="sm"
                          onClick={async()=>{await apiMarkMonitorRead(m.id);load();}}>Прочитано</Btn>
                      )}
                      <Btn variant="ghost" size="sm" style={{color:T.red}}
                        onClick={async()=>{await apiDeleteMonitor(m.id);load();}}>✕</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────
function Settings({user,setUser,toast}:any){
  const [f,setF]=useState({name:user.name,company:user.company??'',
    email:user.email,inn:user.inn??'',activity:user.activity??''});
  const upd=(k:string,v:string)=>setF((p:any)=>({...p,[k]:v}));

  const [saveErr,setSaveErr]=useState<string|null>(null);
  const save=async()=>{
    setSaveErr(null);
    try{
      const u=await apiUpdateMe({name:f.name,company:f.company,inn:f.inn,activity:f.activity});
      setUser((p:any)=>({...p,...u}));
      toast('Настройки сохранены');
    }catch(e:any){
      setSaveErr(e.message??'Ошибка сохранения');
      toast('Не удалось сохранить','error');
    }
  };

  const actOpts=[
    {v:'import',l:'Импорт'},{v:'export',l:'Экспорт'},{v:'transit',l:'Транзит'},
    {v:'service',l:'Услуги'},{v:'bank',l:'Банк / финтех'},{v:'logistics',l:'Логистика'},
  ];

  return(
    <div style={{padding:'28px 32px',maxWidth:600}}>
      <h1 style={{fontSize:20,fontWeight:800,marginBottom:4,letterSpacing:'-0.5px'}}>Настройки</h1>
      <p style={{color:T.textDim,fontSize:13,marginBottom:28}}>Профиль и параметры аккаунта</p>

      <Card style={{padding:24,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:18}}>Пользователь</div>
        <Inp label="Имя" value={f.name} onChange={(v:string)=>upd('name',v)}/>
        <Inp label="Email" value={f.email} onChange={()=>{}} disabled hint="Email нельзя изменить"/>
      </Card>

      <Card style={{padding:24,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:18}}>Компания</div>
        <Inp label="Наименование" value={f.company} onChange={(v:string)=>upd('company',v)}/>
        <Inp label="ИНН" value={f.inn} onChange={(v:string)=>upd('inn',v)} placeholder="7712345678"/>
        <Sel label="Вид деятельности" value={f.activity} onChange={(v:string)=>upd('activity',v)} options={actOpts}/>
      </Card>

      <Card style={{padding:24,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>Тарифный план</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700,color:T.blue,textTransform:'capitalize',fontSize:16}}>
              {user.plan??'Free'}
            </div>
            <div style={{fontSize:12,color:T.textDim}}>Осталось проверок: {user.checksLeft??'5'}</div>
          </div>
          <Btn variant="secondary">Улучшить план</Btn>
        </div>
        {user.plan==='free'&&(
          <div style={{marginTop:12}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:T.textSub,marginBottom:4}}>
              <span>Использование плана Free</span>
              <span>{user.checksUsed??0}/5 проверок</span>
            </div>
            <div style={{height:5,background:T.surf3,borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:3,transition:'width 0.4s',
                background:(user.checksUsed??0)>=4?T.red:(user.checksUsed??0)>=2?T.amber:T.blue,
                width:`${Math.min(100,((user.checksUsed??0)/5)*100)}%`}}/>
            </div>
          </div>
        )}
      </Card>

      <Card style={{padding:20,marginBottom:24}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Статус компонентов v2</div>
        {[
          ['✓','OpenSanctions','Реальный скрининг 50+ баз',T.green],
          ['✓','PDF Generation','pdfkit evidence vault',T.green],
          ['✓','Document Upload','AI-извлечение сущностей',T.green],
          ['✓','Watch-list','Мониторинг OpenSanctions',T.green],
          ['✓','JWT Auth','bcrypt + refresh tokens',T.green],
          ['✓','PostgreSQL','Prisma ORM + Docker',T.green],
        ].map(([ic,t,d,c]:any)=>(
          <div key={t} style={{display:'flex',gap:12,padding:'8px 0',borderBottom:`1px solid ${T.border}`}}>
            <span style={{color:c,flexShrink:0,fontFamily:T.mono,fontSize:13}}>{ic}</span>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>{t}</div>
              <div style={{fontSize:11,color:T.textDim}}>{d}</div>
            </div>
          </div>
        ))}
      </Card>

      {saveErr&&<ErrMsg msg={saveErr} style={{marginBottom:14}}/>}
      <LoadingBtn onClick={save} loadingText="Сохраняем..."
        style={{padding:'11px 28px'}}>
        Сохранить изменения
      </LoadingBtn>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────
export default function App(){
  const [view,setView]=useState('landing');
  const [user,setUser]=useState<any>(null);
  const [result,setResult]=useState<any>(null);
  const [history,setHistory]=useState<any[]>([]);
  const [toasts,setToasts]=useState<any[]>([]);
  const [prefillForm,setPrefillForm]=useState<any>(null);
  const [prefillMonitor,setPrefillMonitor]=useState<any>(null);
  const [alertCount,setAlertCount]=useState(0);
  const [reviewCount,setReviewCount]=useState(0);
  const [sessionExpiredModal,setSessionExpiredModal]=useState(false);
  const [cmdOpen,setCmdOpen]=useState(false);
  const [showOnboarding,setShowOnboarding]=useState(false);

  useEffect(()=>{
    const token=getAccessToken();
    if(!token)return;
    apiGetMe()
      .then(u=>{setUser(u);setView('dashboard');return apiListChecks({page:1,limit:50});})
      .then(d=>{if(d?.data)setHistory(d.data.map(mapCheck));})
      .catch(()=>clearTokens());
  },[]);

  // Inject shimmer CSS animation once
  useEffect(()=>{
    const style=document.createElement('style');
    style.textContent=[
      '@keyframes aegis-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}',
      '@keyframes aegis-spin{to{transform:rotate(360deg)}}',
      // Focus visible ring for keyboard navigation
      '*:focus-visible{outline:2px solid #4575F3;outline-offset:2px;border-radius:4px}',
      // Override for inputs/selects that have their own border
      'input:focus-visible,select:focus-visible{outline:none;border-color:#4575F3 !important;box-shadow:0 0 0 3px rgba(69,117,243,0.15)}',
      // Smooth hover on table rows
      'tr{transition:background-color 0.1s}',
      // Remove default button outline (we handle focus-visible ourselves)
      'button:focus:not(:focus-visible){outline:none}',
    ].join('');
    document.head.appendChild(style);
    return ()=>{document.head.removeChild(style);};
    return()=>document.head.removeChild(style);
  },[]);

  // Session expired → proper modal
  useEffect(()=>{
    const handler=()=>setSessionExpiredModal(true);
    window.addEventListener('aegis:session-expired',handler);
    return()=>window.removeEventListener('aegis:session-expired',handler);
  },[]);

  // Load review queue badge count
  const loadReviewCount=useCallback(()=>{
    if(!getAccessToken())return;
    apiGetReviewStats().then(s=>setReviewCount(s.pending??0)).catch(()=>{});
  },[]);
  useEffect(()=>{loadReviewCount();},[loadReviewCount]);

  // Cmd+K / Ctrl+K command palette
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();if(user)setCmdOpen(o=>!o);}
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[user]);

  // Show onboarding for new users on first login
  useEffect(()=>{
    if(user&&!localStorage.getItem('aegis_onboarded')){
      setTimeout(()=>setShowOnboarding(true),800);
    }
  },[user]);

  const toast=(msg:string,type='success')=>{
    const id=Date.now();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter((x:any)=>x.id!==id)),3500);
  };

  const loadHistory=async()=>{
    try{const d=await apiListChecks({page:1,limit:50});if(d?.data)setHistory(d.data.map(mapCheck));}
    catch{}
  };

  const addToHistory=(item:any)=>setHistory(p=>[item,...p].slice(0,50));

  const deleteCheck=async(id:string)=>{
    try{await apiDeleteCheck(id);setHistory(h=>h.filter((x:any)=>x.id!==id));toast('Удалено');}
    catch{toast('Ошибка удаления','error');}
  };

  const rerunCheck=(form:any)=>{setPrefillForm({...form});setView('check');};

  const logout=async()=>{
    await apiLogout();
    setUser(null);setHistory([]);setResult(null);setAlertCount(0);setView('landing');
  };

  const nav=(v:string)=>{
    const authRequired=['dashboard','check','history','result','documents','monitoring','settings','reviews'];
    if(!user&&authRequired.includes(v)){setView('auth');return;}
    if(v==='dashboard'&&user)loadHistory();
    if(v==='reviews')loadReviewCount();
    setView(v);
  };

  const appProps={nav,user,setUser,toast,history,result,setResult,
    addToHistory,deleteCheck,rerunCheck,prefillForm,
    clearPrefill:()=>setPrefillForm(null),setPrefillForm,alertCount,setAlertCount};

  return(
    <div style={{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:"'Outfit',sans-serif"}}>
      {view==='landing'&&<Landing nav={nav}/>}
      {view==='auth'&&<Auth nav={nav} setUser={setUser} toast={toast}/>}
      {user&&(
        <Shell user={user} view={view} nav={nav} logout={logout} alertCount={alertCount} reviewCount={reviewCount}>
          <ErrorBoundary>
            {view==='dashboard'&&<Dashboard {...appProps}/>}
            {view==='check'&&<CheckForm {...appProps}/>}
            {view==='result'&&result&&<Result nav={nav} result={result} toast={toast} setPrefillMonitor={setPrefillMonitor}/>}
            {view==='history'&&<History {...appProps}/>}
            {view==='documents'&&<Documents nav={nav} toast={toast} setPrefillForm={setPrefillForm}/>}
            {view==='reviews'&&<ReviewQueue nav={nav} setResult={setResult} toast={toast}/>}
            {view==='monitoring'&&<Monitoring toast={toast} setAlertCount={setAlertCount} prefillMonitor={prefillMonitor} clearMonitorPrefill={()=>setPrefillMonitor(null)}/>}
            {view==='settings'&&<Settings user={user} setUser={setUser} toast={toast}/>}
          </ErrorBoundary>
        </Shell>
      )}
      <Toasts toasts={toasts}/>
      <CommandPalette isOpen={cmdOpen} onClose={()=>setCmdOpen(false)} nav={nav} history={history}/>
      {/* Session expired modal — proper blocking UX, not disappearing toast */}
      {sessionExpiredModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:10002,
          display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}>
          <div style={{width:400,background:T.surf,border:`1px solid ${T.borderStr}`,
            borderRadius:14,padding:36,textAlign:'center'}}>
            <div style={{fontSize:40,marginBottom:14}}>🔒</div>
            <div style={{fontWeight:800,fontSize:18,marginBottom:8,letterSpacing:'-0.4px'}}>
              Сессия истекла
            </div>
            <p style={{color:T.textDim,fontSize:13,marginBottom:6,lineHeight:1.6}}>
              Пожалуйста, войдите снова.<br/>Все данные и черновики сохранены.
            </p>
            <p style={{color:T.textSub,fontSize:11,marginBottom:24}}>
              Токен доступа устарел. Это нормально при длительном бездействии.
            </p>
            <Btn style={{width:'100%',justifyContent:'center',padding:'11px'}}
              onClick={()=>{
                setSessionExpiredModal(false);
                setUser(null);setView('auth');
              }}>
              Войти снова
            </Btn>
          </div>
        </div>
      )}
      {showOnboarding&&<Onboarding onClose={()=>setShowOnboarding(false)} nav={nav}/>}
    </div>
  );
}

// ── FLAG MODAL ────────────────────────────────────────────────
// Appears when analyst clicks "Передать на проверку" on Result page
function FlagModal({checkId,counterparty,onClose,toast}:any){
  const [notes,setNotes]=useState('');
  const [priority,setPriority]=useState('normal');

  const submit=async()=>{
    try{
      await apiFlagCheck(checkId,{notes:notes.trim()||undefined,priority});
      toast('Проверка добавлена в очередь');
      onClose(true);
    }catch(e:any){toast(e.message??'Ошибка','error');onClose(false);}
  };

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:9997,
      display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(3px)'}}>
      <div style={{width:460,background:'#0D0F1B',border:`1px solid #232D42`,
        borderRadius:14,padding:32,boxShadow:'0 24px 60px rgba(0,0,0,0.4)'}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:4,letterSpacing:'-0.4px'}}>
          📋 Передать на проверку
        </div>
        <div style={{color:'#7B8BAE',fontSize:13,marginBottom:20}}>
          {counterparty} будет добавлен в очередь для аналитической проверки.
        </div>

        <div style={{marginBottom:14}}>
          <label style={{display:'block',marginBottom:6,fontSize:12,color:'#7B8BAE',fontWeight:500}}>
            Приоритет
          </label>
          <div style={{display:'flex',gap:8}}>
            {['normal','high','urgent'].map(p=>(
              <div key={p} onClick={()=>setPriority(p)} style={{
                flex:1,textAlign:'center',padding:'8px 0',borderRadius:7,cursor:'pointer',
                fontSize:12,fontWeight:600,
                background:priority===p?REVIEW_PRIORITY[p].bg:'#111422',
                color:priority===p?REVIEW_PRIORITY[p].c:'#4A5570',
                border:`1px solid ${priority===p?REVIEW_PRIORITY[p].c:'#1A2030'}`,
              }}>
                {REVIEW_PRIORITY[p].label}
              </div>
            ))}
          </div>
        </div>

        <div style={{marginBottom:20}}>
          <label style={{display:'block',marginBottom:6,fontSize:12,color:'#7B8BAE',fontWeight:500}}>
            Примечания для аналитика — необязательно
          </label>
          <textarea value={notes} onChange={(e:any)=>setNotes(e.target.value)}
            placeholder="Опишите что именно требует внимания..."
            rows={3}
            style={{width:'100%',background:'#111422',border:'1px solid #1A2030',
              borderRadius:7,padding:'9px 12px',color:'#E1E4EE',fontSize:13,
              outline:'none',resize:'vertical',fontFamily:"'Outfit',sans-serif",
              boxSizing:'border-box'}}/>
        </div>

        <div style={{display:'flex',gap:10}}>
          <LoadingBtn onClick={submit} loadingText="Добавляем..."
            style={{flex:2,justifyContent:'center',padding:'10px'}}>
            Добавить в очередь
          </LoadingBtn>
          <Btn variant="ghost" onClick={()=>onClose(false)} style={{flex:1,justifyContent:'center'}}>Отмена</Btn>
        </div>
      </div>
    </div>
  );
}

// ── REVIEW QUEUE ──────────────────────────────────────────────
function ReviewQueue({nav,setResult,toast}:any){
  const [reviews,setReviews]=useState<ApiReview[]>([]);
  const [statusFilter,setStatusFilter]=useState('active');
  const [loading,setLoading]=useState(true);
  const [decidingId,setDecidingId]=useState<string|null>(null);
  const [decisionModal,setDecisionModal]=useState<{review:ApiReview;action:'approve'|'escalate'|'reject'}|null>(null);
  const [decisionNote,setDecisionNote]=useState('');

  const load=useCallback(()=>{
    const s=statusFilter==='active'?undefined:'all';
    apiListReviews(s)
      .then(data=>{
        setReviews(statusFilter==='active'
          ? data.filter(r=>['pending','in_review'].includes(r.status))
          : data
        );
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[statusFilter]);

  useEffect(()=>{setLoading(true);load();},[load]);

  const decide=async(review:ApiReview,decision:string,note:string)=>{
    setDecidingId(review.id);
    try{
      await apiDecideReview(review.id,{decision,decisionNote:note.trim()||undefined});
      toast(decision==='approve'?'Одобрено':decision==='escalate'?'Эскалировано':'Отклонено');
      setDecisionModal(null);setDecisionNote('');
      load();
    }catch(e:any){toast(e.message??'Ошибка','error');}
    finally{setDecidingId(null);}
  };

  const removeFlag=async(id:string)=>{
    try{await apiDeleteReview(id);toast('Флаг снят');load();}
    catch(e:any){toast(e.message??'Ошибка','error');}
  };

  const sc=riskColor;
  const statusCounts={
    active: reviews.filter(r=>['pending','in_review'].includes(r.status)).length,
  };

  return(
    <div style={{padding:'28px 32px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,letterSpacing:'-0.5px'}}>Очередь проверок</h1>
          <p style={{color:'#7B8BAE',fontSize:13,marginTop:4}}>
            Аналитический workflow: флаг → рассмотрение → решение → audit trail
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {[['active','Активные'],['all','Все']].map(([v,l])=>(
            <Btn key={v} variant={statusFilter===v?'secondary':'ghost'} size="sm"
              onClick={()=>setStatusFilter(v)}>{l}</Btn>
          ))}
        </div>
      </div>

      {loading?(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[0,1,2].map(i=><SkeletonCard key={i} lines={2}/>)}
        </div>
      ):reviews.length===0?(
        <Card style={{textAlign:'center',padding:56}}>
          <div style={{fontSize:36,marginBottom:12}}>◈</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>
            {statusFilter==='active'?'Нет активных проверок':'История пуста'}
          </div>
          <p style={{color:'#7B8BAE',fontSize:13,maxWidth:400,margin:'0 auto 8px',lineHeight:1.6}}>
            {statusFilter==='active'
              ?'Флагуйте проверки через кнопку «Передать на проверку» на странице результата'
              :'Ни одна проверка ещё не была передана на рассмотрение'}
          </p>
          <Btn style={{marginTop:16}} onClick={()=>nav('history')}>Открыть историю</Btn>
        </Card>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {reviews.map(r=>{
            const check=r.check;
            const result=check?.result as any;
            const rs=REVIEW_STATUS[r.status]??REVIEW_STATUS.pending;
            const rp=REVIEW_PRIORITY[r.priority]??REVIEW_PRIORITY.normal;
            const isActive=['pending','in_review'].includes(r.status);
            return(
              <Card key={r.id} style={{padding:20,
                borderLeft:`3px solid ${isActive?rp.c:'#1A2030'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',
                  alignItems:'flex-start',flexWrap:'wrap',gap:12}}>

                  {/* Left — check info */}
                  <div style={{flex:1,minWidth:240}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontWeight:700,fontSize:14}}>{check?.counterparty}</span>
                      <span style={{background:rp.c+'20',color:rp.c,fontSize:10,fontWeight:700,
                        padding:'2px 7px',borderRadius:20}}>{rp.label}</span>
                      <span style={{background:rs.bg,color:rs.c,fontSize:10,fontWeight:700,
                        padding:'2px 7px',borderRadius:20}}>{rs.label}</span>
                    </div>
                    <div style={{display:'flex',gap:12,fontSize:12,color:'#7B8BAE',marginBottom:r.notes?8:0}}>
                      <span>{check?.country}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",
                        color:sc(result?.score??0)}}>
                        скор: {result?.score??'—'}
                      </span>
                      <span>флаг: {fmtDateTime(r.createdAt)}</span>
                    </div>
                    {r.notes&&(
                      <div style={{fontSize:12,color:'#7B8BAE',fontStyle:'italic',
                        background:'#111422',borderRadius:5,padding:'5px 9px',marginTop:4}}>
                        «{r.notes}»
                      </div>
                    )}
                    {r.decision&&(
                      <div style={{marginTop:8,fontSize:12,color:rs.c}}>
                        <strong>Решение:</strong> {
                          r.decision==='approve'?'Одобрено':
                          r.decision==='escalate'?'Эскалировано':'Отклонено'
                        }
                        {r.decisionNote&&` — «${r.decisionNote}»`}
                        {r.decidedAt&&<span style={{color:'#4A5570'}}> · {fmtDateTime(r.decidedAt)}</span>}
                      </div>
                    )}
                  </div>

                  {/* Right — actions */}
                  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                    <Btn variant="ghost" size="sm"
                      onClick={()=>{setResult({...result,checkRecord:{id:check.id,date:check.createdAt,counterparty:check.counterparty,country:check.country,currency:'',form:check.formData}});nav('result');}}>
                      Открыть
                    </Btn>
                    {isActive&&<>
                      <LoadingBtn variant="success" size="sm"
                        disabled={decidingId===r.id}
                        onClick={()=>setDecisionModal({review:r,action:'approve'})}>
                        ✓ Одобрить
                      </LoadingBtn>
                      <LoadingBtn size="sm" variant="secondary"
                        disabled={decidingId===r.id}
                        onClick={()=>setDecisionModal({review:r,action:'escalate'})}>
                        ↑ Эскалировать
                      </LoadingBtn>
                      <Btn variant="danger" size="sm"
                        disabled={decidingId===r.id}
                        onClick={()=>setDecisionModal({review:r,action:'reject'})}>
                        ✕
                      </Btn>
                    </>}
                    {!isActive&&(
                      <Btn variant="ghost" size="sm" style={{color:'#F04747'}}
                        onClick={()=>removeFlag(r.id)}>Снять флаг</Btn>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Decision confirmation modal */}
      {decisionModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:9996,
          display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(3px)'}}>
          <div style={{width:440,background:'#0D0F1B',border:'1px solid #232D42',
            borderRadius:12,padding:28}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>
              {decisionModal.action==='approve'?'✓ Подтвердить одобрение':
               decisionModal.action==='escalate'?'↑ Эскалировать проверку':
               '✕ Отклонить сделку'}
            </div>
            <div style={{color:'#7B8BAE',fontSize:13,marginBottom:16}}>
              {decisionModal.review.check.counterparty}
            </div>
            <div style={{marginBottom:16}}>
              <label style={{display:'block',marginBottom:6,fontSize:12,color:'#7B8BAE'}}>
                Комментарий к решению — необязательно
              </label>
              <textarea value={decisionNote} onChange={(e:any)=>setDecisionNote(e.target.value)}
                placeholder={decisionModal.action==='approve'?'Основание для одобрения...':
                  decisionModal.action==='escalate'?'Причина эскалации...':'Основание для отказа...'}
                rows={3}
                style={{width:'100%',background:'#111422',border:'1px solid #1A2030',
                  borderRadius:7,padding:'9px 12px',color:'#E1E4EE',fontSize:13,
                  outline:'none',resize:'vertical',fontFamily:"'Outfit',sans-serif",
                  boxSizing:'border-box'}}/>
            </div>
            <div style={{display:'flex',gap:10}}>
              <Btn variant={decisionModal.action==='approve'?'success':decisionModal.action==='escalate'?'secondary':'danger'}
                onClick={()=>decide(decisionModal.review,decisionModal.action,decisionNote)}
                disabled={decidingId!==null}
                style={{flex:2,justifyContent:'center',padding:'10px'}}>
                {decidingId?'Сохраняем...':
                  decisionModal.action==='approve'?'Одобрить':
                  decisionModal.action==='escalate'?'Эскалировать':'Отклонить'}
              </Btn>
              <Btn variant="ghost" onClick={()=>{setDecisionModal(null);setDecisionNote('');}}
                style={{flex:1,justifyContent:'center'}}>Отмена</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
