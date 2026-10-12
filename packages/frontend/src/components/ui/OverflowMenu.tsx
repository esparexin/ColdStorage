'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from './Button';
import styles from './OverflowMenu.module.css';

export interface OverflowMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  id?: string;
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  ariaLabel?: string;
  id?: string;
  triggerVariant?: 'outline' | 'ghost';
  triggerSize?: 'sm' | 'md';
}

export function OverflowMenu({
  items,
  ariaLabel = 'More actions',
  id,
  triggerVariant = 'outline',
  triggerSize = 'sm',
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const visibleItems = items.filter(Boolean);

  const checkPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const scrollParent = containerRef.current.closest('[class*="tableWrapper"]');
    let containerSpaceBelow = spaceBelow;
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      containerSpaceBelow = parentRect.bottom - rect.bottom;
    }

    const estimatedHeight = Math.max(120, visibleItems.length * 36);
    const hasEnoughBelow =
      spaceBelow >= estimatedHeight && containerSpaceBelow >= estimatedHeight;
    const shouldOpenUp =
      !hasEnoughBelow && (spaceAbove > spaceBelow || spaceAbove >= estimatedHeight);
    setOpenUpward(shouldOpenUp);
  }, [visibleItems.length]);

  const toggleMenu = () => {
    if (!open) {
      checkPosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    checkPosition();

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };

    const handleScrollOrResize = () => {
      checkPosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, checkPosition, handleClose]);

  // Focus management when menu opens
  useEffect(() => {
    if (open && itemRefs.current.length > 0) {
      const firstEnabled = itemRefs.current.find(
        (el) => el && !el.disabled,
      );
      firstEnabled?.focus();
    }
  }, [open]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledElements = itemRefs.current.filter(
      (el): el is HTMLButtonElement => el !== null && !el.disabled,
    );
    if (!enabledElements.length) return;

    const currentIndex = enabledElements.indexOf(
      document.activeElement as HTMLButtonElement,
    );

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex =
        currentIndex < enabledElements.length - 1 ? currentIndex + 1 : 0;
      enabledElements[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex =
        currentIndex > 0 ? currentIndex - 1 : enabledElements.length - 1;
      enabledElements[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      enabledElements[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      enabledElements[enabledElements.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  if (!visibleItems.length) return null;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Button
        ref={triggerRef}
        id={id}
        variant={triggerVariant}
        size={triggerSize}
        onClick={toggleMenu}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        leftIcon={<MoreVertical size={13} aria-hidden="true" />}
      />

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          className={`${styles.menu} ${openUpward ? styles.menuUpward : ''}`}
          onKeyDown={handleMenuKeyDown}
        >
          {visibleItems.map((item, idx) => (
            <button
              key={item.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              id={item.id}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              title={item.title}
              className={`${styles.menuItem} ${item.danger ? styles.menuItemDanger : ''}`}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
