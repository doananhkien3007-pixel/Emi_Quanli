'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Clock3,
  Megaphone,
  Package,
  PackageSearch,
  QrCode,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { money, shortMoney } from '../lib/model';
import type { todayOperations } from '../lib/analytics';

type Operations = ReturnType<typeof todayOperations>;

function AnimatedMetric({ value, format }: { value: number; format: (current: number) => string }) {
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previous.current = value;
      const reducedMotionFrame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(reducedMotionFrame);
    }
    const from = previous.current;
    const duration = 650;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="animated-metric" aria-label={format(value)}><span aria-hidden="true">{format(display)}</span></span>;
}

export function TodayOverview({ data, spxCount, neededCount, staleCount, onSpx, onNeeded, onStale, onAds }: {
  data: Operations;
  spxCount: number;
  neededCount: number;
  staleCount: number;
  onSpx: () => void;
  onNeeded: () => void;
  onStale: () => void;
  onAds: () => void;
}) {
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const [activeStatus, setActiveStatus] = useState<number | null>(null);
  const [tasksOpen, setTasksOpen] = useState(true);
  const gradient = useId().replaceAll(':', '');
  const glow = useId().replaceAll(':', '');
  const tasksId = useId().replaceAll(':', '');
  const max = Math.max(...data.hours.map(hour => hour.value), 1) * 1.15;
  const x = (hour: number) => 42 + hour / 23 * 638;
  const y = (value: number) => 156 - value / max * 126;
  const points = data.hours.map(hour => `${x(hour.hour)},${y(hour.value)}`).join(' ');
  const statuses = [
    { label: 'Đơn mới', shortLabel: 'đơn mới', orders: data.created, color: '#5b8def' },
    { label: 'Giao thành công', shortLabel: 'đã giao', orders: data.delivered, color: '#10a77e' },
    { label: 'Hoàn', shortLabel: 'đơn hoàn', orders: data.returned, color: '#e86c8b' },
  ];
  const totalEvents = statuses.reduce((sum, status) => sum + status.orders.length, 0);
  const totalTasks = spxCount + neededCount + staleCount;
  const circumference = 2 * Math.PI * 64;
  const selectedHour = activeHour === null ? null : data.hours[activeHour];
  const selectedStatus = activeStatus === null ? null : statuses[activeStatus];
  const nonEmptyStatuses = statuses.filter(status => status.orders.length > 0).length;
  const lastActiveHour = [...data.hours].reverse().find(hour => hour.count > 0)?.hour;
  const averageOrder = data.created.length ? data.revenue / data.created.length : 0;
  const adsShare = data.revenue > 0 ? data.ads / data.revenue * 100 : 0;
  const roasProgress = data.closedRoas === null ? 0 : Math.min(100, data.closedRoas / 4 * 100);
  const productPerOrder = data.created.length ? data.productQuantity / data.created.length : 0;
  const insight = data.created.length === 0
    ? 'Chưa có đơn chốt hôm nay — tạo đơn mới để bắt đầu nhịp bán hàng.'
    : data.ads === 0
      ? `${data.created.length} đơn đã chốt, nhưng chưa ghi nhận chi phí Ads hôm nay.`
      : (data.closedRoas || 0) >= 4
        ? `ROAS ${data.closedRoas?.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}x đang ở vùng tích cực.`
        : `Giá trị đơn trung bình hôm nay là ${money(averageOrder)}.`;

  return <div className="today-overview">
    <section className="panel today-hero" aria-labelledby="today-revenue-title">
      <div className="today-hero-heading">
        <div>
          <span className="today-live"><i /> DỮ LIỆU HÔM NAY</span>
          <h2 id="today-revenue-title">Nhịp bán hàng</h2>
        </div>
        <div className="today-hero-meta"><Activity size={14} /><span>{lastActiveHour === undefined ? 'Chưa có hoạt động' : `Phát sinh gần nhất lúc ${String(lastActiveHour).padStart(2, '0')}:00`}</span></div>
      </div>
      <div className="today-hero-body">
        <div className="today-hero-summary">
          <span>Doanh thu đơn chốt</span>
          <strong><AnimatedMetric value={data.revenue} format={value => money(Math.round(value))} /></strong>
          <div className="today-hero-chips">
            <span><b>{data.created.length}</b> đơn hàng</span>
            <span><b>{data.productQuantity}</b> sản phẩm</span>
          </div>
          <p><Sparkles size={14} />{insight}</p>
        </div>
        <div className="today-chart" onPointerLeave={() => setActiveHour(null)}>
          <div className="hourly-plot"><svg viewBox="0 0 710 190" role="group" aria-label="Doanh số đơn chốt theo giờ Việt Nam">
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10a77e" stopOpacity=".3" /><stop offset="100%" stopColor="#10a77e" stopOpacity="0" /></linearGradient>
              <filter id={glow} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            {[0, 1, 2].map(index => <g key={index}><line x1="42" x2="680" y1={y(max * index / 2)} y2={y(max * index / 2)} stroke="rgba(255,255,255,.13)" strokeWidth=".8" strokeDasharray={index ? '3 6' : undefined} /><text x="34" y={y(max * index / 2) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,.52)">{shortMoney(max * index / 2)}</text></g>)}
            <polygon className="hourly-area" points={`42,156 ${points} 680,156`} fill={`url(#${gradient})`} />
            <polyline className="hourly-line" points={points} fill="none" stroke="#6ee7c1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {selectedHour && <line x1={x(selectedHour.hour)} x2={x(selectedHour.hour)} y1="26" y2="156" stroke="rgba(255,255,255,.44)" strokeWidth=".8" strokeDasharray="3 4" />}
            {data.hours.map(hour => <g key={hour.hour}>
              {[0, 6, 12, 18, 23].includes(hour.hour) && <text x={x(hour.hour)} y="180" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.52)">{String(hour.hour).padStart(2, '0')}:00</text>}
              {(hour.count > 0 || activeHour === hour.hour) && <circle cx={x(hour.hour)} cy={y(hour.value)} r={activeHour === hour.hour ? 5 : 3.2} fill="#143c3a" stroke="#a7f3d0" strokeWidth="2" filter={activeHour === hour.hour ? `url(#${glow})` : undefined} />}
              <rect className="hourly-hit" x={x(hour.hour) - 13} y="20" width="26" height="140" fill="transparent" tabIndex={0} role="button" aria-label={`${hour.hour} giờ: ${hour.count} đơn, ${money(hour.value)}`} onPointerEnter={() => setActiveHour(hour.hour)} onFocus={() => setActiveHour(hour.hour)} onBlur={() => setActiveHour(null)} onClick={() => setActiveHour(hour.hour)} onKeyDown={event => { if (event.key === 'Escape') setActiveHour(null); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveHour(hour.hour); } }} />
            </g>)}
          </svg>
          {selectedHour && <div className="hourly-tooltip" role="tooltip" style={{ left: `${Math.max(18, Math.min(82, x(selectedHour.hour) / 710 * 100))}%` }}><span>{String(selectedHour.hour).padStart(2, '0')}:00 – {String(selectedHour.hour).padStart(2, '0')}:59</span><strong>{money(selectedHour.value)}</strong><small><i />{selectedHour.count} đơn chốt</small></div>}
          </div>
          <div className="hourly-readout"><span>00:00</span><span>Di chuyển trên biểu đồ để xem chi tiết</span><span>23:00</span></div>
          {data.unknownCount > 0 && <small className="hourly-unknown">{data.unknownCount} đơn chưa có giờ · {money(data.unknownValue)}</small>}
        </div>
      </div>
    </section>

    <section className="panel today-status" aria-labelledby="today-status-title">
      <div className="panel-title"><div><span className="section-kicker">DÒNG ĐƠN HÀNG</span><h2 id="today-status-title">Trạng thái hôm nay</h2></div><span className="today-status-total">{totalEvents} lượt</span></div>
      <div className="today-status-content">
        <div className="today-donut-wrap"><svg className="today-donut" viewBox="0 0 180 180" role="img" aria-label={totalEvents ? statuses.map(status => `${status.label}: ${status.orders.length} đơn`).join(', ') : 'Chưa có hoạt động đơn hôm nay'}>
          <circle cx="90" cy="90" r="64" fill="none" stroke="#eef2f7" strokeWidth="17" />
          {statuses.map((status, index) => {
            const count = status.orders.length;
            const preceding = statuses.slice(0, index).reduce((sum, item) => sum + item.orders.length, 0);
            return count > 0 && <circle className="donut-segment" key={status.label} cx="90" cy="90" r="64" fill="none" stroke={status.color} strokeWidth={activeStatus === index ? 20 : 17} strokeLinecap="round" opacity={activeStatus === null || activeStatus === index ? 1 : .22} strokeDasharray={`${Math.max(.1, count / totalEvents * circumference - (nonEmptyStatuses > 1 ? Math.min(6, count / totalEvents * circumference * .17) : 0))} ${circumference}`} strokeDashoffset={-preceding / totalEvents * circumference} transform="rotate(-90 90 90)"><title>{`${status.label}: ${count} đơn · ${money(status.orders.reduce((sum, order) => sum + order.price, 0))}`}</title></circle>;
          })}
          <text x="90" y="88" textAnchor="middle" className="donut-value">{selectedStatus ? selectedStatus.orders.length : totalEvents}</text>
          <text x="90" y="108" textAnchor="middle" className="donut-label">{selectedStatus ? selectedStatus.shortLabel : 'lượt hoạt động'}</text>
        </svg><span className="donut-orbit" /></div>
        <div className="today-status-list">{statuses.map((status, index) => <button type="button" className={activeStatus === index ? 'is-active' : ''} key={status.label} onPointerEnter={() => setActiveStatus(index)} onPointerLeave={() => setActiveStatus(null)} onFocus={() => setActiveStatus(index)} onBlur={() => setActiveStatus(null)}>
          <span><i style={{ background: status.color }} />{status.label}</span><strong>{status.orders.length}<em>đơn</em></strong><small>{money(status.orders.reduce((sum, order) => sum + order.price, 0))}</small><ArrowRight size={13} />
        </button>)}</div>
      </div>
    </section>

    <section className={`today-tasks ${tasksOpen ? 'tasks-open' : 'tasks-collapsed'}`} aria-labelledby="today-tasks-title">
      <div className="today-tasks-title"><div><span className="today-tasks-kicker">ƯU TIÊN HÔM NAY</span><h2 id="today-tasks-title">Cần xử lý</h2><p>{totalTasks ? 'Xử lý theo thứ tự để đơn đi nhanh hơn' : 'Mọi việc quan trọng đã hoàn tất'}</p></div><strong>{totalTasks}<small>việc</small></strong><button type="button" className="today-tasks-toggle" aria-expanded={tasksOpen} aria-controls={tasksId} onClick={() => setTasksOpen(open => !open)}><span>{tasksOpen ? 'Thu gọn' : 'Mở danh sách'}</span><ChevronDown size={16} /></button></div>
      <div className="today-task-actions" id={tasksId}>
        <button className="today-task-card task-spx" onClick={onSpx}><span className="today-task-icon"><QrCode size={18} /></span><span className="today-task-copy"><b>Chưa tạo đơn SPX</b><small>Tạo mã để sẵn sàng gửi hàng</small></span><strong>{spxCount}</strong><ArrowRight size={16} /></button>
        <button className="today-task-card task-stock" onClick={onNeeded}><span className="today-task-icon"><PackageSearch size={18} /></span><span className="today-task-copy"><b>Cần lấy hàng từ xưởng</b><small>Bổ sung hàng còn thiếu cho đơn</small></span><strong>{neededCount}</strong><ArrowRight size={16} /></button>
        <button className="today-task-card task-stale" onClick={onStale}><span className="today-task-icon"><Clock3 size={18} /></span><span className="today-task-copy"><b>Quá 3 ngày chưa giao</b><small>Kiểm tra tiến độ và cập nhật đơn</small></span><strong>{staleCount}</strong><ArrowRight size={16} /></button>
      </div>
    </section>

    <div className="today-ads" aria-label="Chỉ số kinh doanh hôm nay">
      <section className="panel mini-today-stat ads"><div><span className="metric-icon"><Megaphone size={17} /></span><span>Chi phí Ads</span><button className="text-button" onClick={onAds}>Nhập Ads</button></div><strong><AnimatedMetric value={data.ads} format={value => money(Math.round(value))} /></strong><div className="metric-foot"><span>Ads / doanh thu</span><b>{adsShare.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</b></div><span className="metric-track"><i style={{ width: `${Math.min(100, adsShare)}%` }} /></span></section>
      <section className="panel mini-today-stat cpa"><div><span className="metric-icon"><Target size={17} /></span><span>CPA hôm nay</span><small>mỗi đơn chốt</small></div><strong>{data.cpa === null ? '—' : <AnimatedMetric value={data.cpa} format={value => money(Math.round(value))} />}</strong><div className="metric-foot"><span>Giá trị đơn TB</span><b>{money(averageOrder)}</b></div><span className="metric-track"><i style={{ width: `${averageOrder > 0 && data.cpa !== null ? Math.min(100, data.cpa / averageOrder * 100) : 0}%` }} /></span></section>
      <section className="panel mini-today-stat roas"><div><span className="metric-icon"><TrendingUp size={17} /></span><span>ROAS chốt</span><small>mục tiêu 4x</small></div><strong>{data.closedRoas === null ? '—' : <AnimatedMetric value={data.closedRoas} format={value => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}x`} />}</strong><div className="metric-foot"><span>Tiến độ mục tiêu</span><b>{Math.round(roasProgress)}%</b></div><span className="metric-track"><i style={{ width: `${roasProgress}%` }} /></span></section>
      <section className="panel mini-today-stat products"><div><span className="metric-icon"><Package size={17} /></span><span>Sản phẩm đã chốt</span><small>hôm nay</small></div><strong><AnimatedMetric value={data.productQuantity} format={value => Math.round(value).toLocaleString('vi-VN')} /></strong><div className="metric-foot"><span>Sản phẩm / đơn</span><b>{productPerOrder.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</b></div><span className="metric-track"><i style={{ width: `${Math.min(100, productPerOrder / 3 * 100)}%` }} /></span></section>
    </div>
  </div>;
}
