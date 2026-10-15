'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Search, ShoppingBag } from 'lucide-react';
import { money, shortMoney } from '../lib/model';
import type { DailyMetric, CohortDailyMetric } from '../lib/analytics';

const displayDate = (date: string) => date.split('-').reverse().join('/');

export function EmptyState({ text, onReset }: { text: string; onReset?: () => void }) {
  return <div className="empty" role="status">
    <span className="empty-icon">{onReset ? <Search size={23} /> : <ShoppingBag size={23} />}</span>
    <strong>{text}</strong>
    {onReset && <button className="button small" onClick={onReset}>Xóa bộ lọc</button>}
  </div>;
}

export function DashboardSkeleton() {
  return <div className="dashboard-skeleton" role="status" aria-label="Đang tải dữ liệu cửa hàng" aria-busy="true">
    <span className="sr-only">Đang tải dữ liệu cửa hàng…</span>
    <div className="skeleton-toolbar skeleton" />
    <div className="stats-grid" aria-hidden="true">{[0, 1, 2, 3].map(i => <div className="stat-card" key={i}>
      <span className="skeleton skeleton-label" /><span className="skeleton skeleton-value" /><span className="skeleton skeleton-note" />
    </div>)}</div>
    <div className="chart-grid" aria-hidden="true"><div className="panel skeleton-chart"><span className="skeleton skeleton-label" /><div className="skeleton skeleton-plot" /></div><div className="panel skeleton-chart"><span className="skeleton skeleton-label" /><div className="skeleton skeleton-ring" /></div></div>
    <div className="panel skeleton-table" aria-hidden="true">{[0, 1, 2, 3].map(i => <div className="skeleton" key={i} />)}</div>
  </div>;
}

export function RevenueChart({ daily, mode = 'costs' }: { daily: (DailyMetric | CohortDailyMetric)[]; mode?: 'costs' | 'profit' | 'ads' | 'all' }) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(700);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipId = useId();
  const gradientId = useId().replaceAll(':', '');
  useEffect(() => {
    if (!svgRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [daily.length]);
  if (!daily.length) return <EmptyState text="Chọn khoảng ngày hợp lệ để xem biểu đồ." />;
  const compact = width < 520;
  const chartDaily = compact ? daily.filter(day => day.orders.length > 0 || day.revenue !== 0 || day.costs !== 0 || day.profit !== 0 || day.ads !== 0) : daily;
  const hiddenDays = daily.length - chartDaily.length;
  if (!chartDaily.length) return <EmptyState text="Chưa có ngày phát sinh kinh doanh trong kỳ này." />;
  const showAll = mode === 'all';
  const secondary = mode === 'costs' ? 'costs' : mode === 'profit' ? 'profit' : 'ads';
  const secondaryColor = mode === 'costs' ? '#d94343' : mode === 'profit' ? '#059669' : '#8b5cf6';
  const values = chartDaily.flatMap(day => showAll ? [day.revenue, day.costs, day.profit] : [day.revenue, day[secondary]]);
  const high = Math.max(...values, 1) * 1.15, low = Math.min(...values, 0) * 1.15;
  const height = compact ? 280 : showAll ? 220 : 240, left = compact ? 48 : 60, right = compact ? 12 : 18, top = 15, base = height-36;
  const x = (index: number) => left + (chartDaily.length === 1 ? .5 : index / (chartDaily.length - 1)) * (width - left - right);
  const y = (value: number) => base - (value - low) / (high - low) * (base - top);
  const points = (key: 'revenue' | 'costs' | 'profit' | 'ads') => chartDaily.map((day, index) => `${x(index)},${y(day[key])}`).join(' ');
  const current = active === null ? undefined : chartDaily[active];
  const labelStep = Math.max(1, Math.ceil(chartDaily.length / Math.max(3, Math.floor(width / 100))));
  const selectPoint = (event: React.PointerEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(chartDaily.length - 1, Math.round((event.clientX - bounds.left) / bounds.width * (chartDaily.length - 1)))));
  };
  return <div className="chart-canvas interactive-chart business-chart">
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${showAll ? 'Doanh thu, chi phí và lợi nhuận' : `Doanh thu và ${mode === 'costs' ? 'chi phí' : mode === 'profit' ? 'lợi nhuận' : 'Ads'}`} theo thời gian. Dùng phím mũi tên để xem số liệu.`} onPointerLeave={() => setActive(null)}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#147d52" stopOpacity=".16"/><stop offset="100%" stopColor="#147d52" stopOpacity=".01"/></linearGradient></defs>
      {[0, 1, 2, 3].map(index => { const value = low + (high - low) * index / 3; return <g key={index}>
        <line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="#e7ecf4" strokeDasharray="3 5" />
        <text x={left-10} y={y(value)+4} fill="#78859a" textAnchor="end" fontSize="10">{shortMoney(value)}</text>
      </g>; })}
      <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} stroke="#a9b6ca" strokeDasharray="4 4" />
      {chartDaily.length > 1 && <><polygon points={`${x(0)},${y(0)} ${points('revenue')} ${x(chartDaily.length-1)},${y(0)}`} fill={`url(#${gradientId})`} />
        <polyline points={points('revenue')} stroke="#147d52" strokeWidth={compact?3:2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {showAll?<><polyline points={points('costs')} stroke="#d15b64" strokeWidth={compact?2.8:2.2} fill="none" strokeLinejoin="round" strokeLinecap="round"/><polyline points={points('profit')} stroke="#5576bd" strokeWidth={compact?2.8:2.2} fill="none" strokeLinejoin="round" strokeLinecap="round"/></>:<polyline points={points(secondary)} stroke={secondaryColor} strokeWidth={compact?3:2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />}</>}
      {chartDaily.map((day, index) => <g key={day.date}>
        {(chartDaily.length < 20 || index === active) && <><circle cx={x(index)} cy={y(day.revenue)} r="2.8" fill="white" stroke="#147d52" strokeWidth="1.8"/>{showAll?<><circle cx={x(index)} cy={y(day.costs)} r="2.8" fill="white" stroke="#d15b64" strokeWidth="1.8"/><circle cx={x(index)} cy={y(day.profit)} r="2.8" fill="white" stroke="#5576bd" strokeWidth="1.8"/></>:<circle cx={x(index)} cy={y(day[secondary])} r="3" fill="white" stroke={secondaryColor} strokeWidth="2"/>}</>}
        {(index % labelStep === 0 && chartDaily.length - 1 - index >= labelStep * .65 || index === chartDaily.length - 1) && <text x={x(index)} y={height-10} fill="#78859a" textAnchor="middle" fontSize="10">{day.date.slice(8)}/{day.date.slice(5,7)}</text>}
      </g>)}
      {current && active !== null && <line x1={x(active)} x2={x(active)} y1={top} y2={base} stroke="#a9b6ca" strokeDasharray="4 4"/>}
      <rect x={left} y={top} width={width-left-right} height={base-top} fill="transparent" tabIndex={0} role="button" aria-label="Khám phá dữ liệu biểu đồ" aria-describedby={current ? tooltipId : undefined}
        onFocus={() => setActive(0)} onBlur={() => setActive(null)} onPointerMove={selectPoint} onClick={selectPoint}
        onKeyDown={event => {
          if (event.key === 'Escape') { setActive(null); return; }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? chartDaily.length-1 : Math.max(0, Math.min(chartDaily.length-1, (index ?? 0) + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))));
        }}/>
    </svg>
    {compact&&hiddenDays>0&&<small className="chart-mobile-note">Đã ẩn {hiddenDays} ngày không phát sinh</small>}
    {current && <div className={'chart-tooltip '+(active! > (chartDaily.length-1)/2 ? 'tooltip-left' : 'tooltip-right')} id={tooltipId} role="tooltip">
      <strong>{displayDate(current.date)}{current.endDate !== current.date && current.endDate ? ` – ${displayDate(current.endDate)}` : ''}</strong>
      <dl>
        <div><dt><i className="revenue-dot" style={{ background: '#147d52' }}/>Doanh thu thực</dt><dd>{money(current.revenue)}</dd></div>
        <div><dt><i className="cost-dot" style={{ background: '#d94343' }}/>Tổng chi phí</dt><dd>{money(current.costs)}</dd></div>
        <div><dt>Facebook Ads</dt><dd>{money(current.ads)}</dd></div>
        <div><dt>Đơn chốt / Thành công</dt><dd>{current.orders.length} / {current.done.length}</dd></div>
        <div className="tooltip-profit"><dt>Lợi nhuận{current.provisional ? ' tạm tính' : ' thực'}</dt><dd className={current.profit < 0 ? 'negative' : 'positive'}>{money(current.profit)}</dd></div>
      </dl>
    </div>}
  </div>;
}

export function Stat({ label, value, icon: Icon, note, primary = false, negative = false, accent = '', trend }: {
  label: string; value: string; icon: typeof ShoppingBag; note?: string; primary?: boolean; negative?: boolean; accent?: string; trend?: { current: number; previous: number; reverse?: boolean };
}) {
  const change = trend ? trend.current - trend.previous : 0;
  const improving = trend?.reverse ? change <= 0 : change >= 0;
  const comparison = !trend ? null : trend.previous === 0 ? (trend.current === 0 ? 'Không thay đổi' : `${change > 0 ? '+' : '−'}${shortMoney(Math.abs(change))}`) : `${change > 0 ? '+' : ''}${(change / Math.abs(trend.previous) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  return <section className={`stat-card tone-${accent || 'neutral'} ${primary ? 'featured' : ''} ${negative ? 'stat-negative' : ''}`}>
    <div className="stat-label">{label}<span className={'stat-icon '+accent}><Icon size={18} strokeWidth={1.8}/></span></div>
    <strong className="stat-value">{value}</strong>
    {trend && <div className={'stat-trend '+(change === 0 ? '' : improving ? 'trend-up' : 'trend-down')}>{change !== 0 && (change > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>)}<b>{comparison}</b><span>so với kỳ trước</span></div>}
    {note && <div className="stat-note">{note}</div>}
  </section>;
}
