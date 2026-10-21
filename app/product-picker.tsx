'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Shirt } from 'lucide-react';
import type { Shop } from '../lib/model';
import { money } from '../lib/model';
import { productImage } from '../lib/product-images';
import './product-picker.css';

type Product = Shop['products'][number];

function Thumbnail({ name, products }: { name: string; products: Product[] }) {
  const image = productImage(name, products);
  return <span className="product-picker-thumbnail">{image
    ? <img src={image} alt="" loading="lazy" width={38} height={46} />
    : <Shirt size={18} aria-hidden="true" />}</span>;
}

export function ProductPicker({ value, products, index, onChange }: {
  value: string;
  products: Product[];
  index: number;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const choices = products.some(product => product.name === value) || !value
    ? products
    : [...products, { name: value, price: 0, cost: 0 }];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const focusOption = (at: number) => {
    requestAnimationFrame(() => options.current[at]?.focus());
  };
  const openAt = (at: number) => {
    if (!choices.length) return;
    setOpen(true);
    focusOption(at);
  };
  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    trigger.current?.focus();
  };
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const selected = Math.max(0, choices.findIndex(product => product.name === value));
      openAt(event.key === 'ArrowDown' ? selected : choices.length - 1);
    }
  };
  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      focusOption(next);
    }
  };

  return <div className={`product-picker${open ? ' is-open' : ''}`} ref={root}>
    <button ref={trigger} type="button" className="product-picker-trigger" aria-label={`Sản phẩm ${index + 1}: ${value || 'Chưa chọn'}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(current => !current)} onKeyDown={onTriggerKeyDown}>
      <Thumbnail name={value} products={products} />
      <span className="product-picker-current">{value || 'Chọn sản phẩm'}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="product-picker-menu" id={listId} role="listbox" aria-label={`Chọn sản phẩm ${index + 1}`}>
      {choices.map((product, at) => <button key={product.name} ref={element => { options.current[at] = element; }} type="button" role="option" aria-selected={product.name === value} className="product-picker-option" onClick={() => choose(product.name)} onKeyDown={event => onOptionKeyDown(event, at)}>
        <Thumbnail name={product.name} products={products} />
        <span className="product-picker-option-copy"><strong>{product.name}</strong><small>{product.price ? money(product.price) : 'Sản phẩm trong đơn cũ'}</small></span>
        {product.name === value && <Check size={16} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
