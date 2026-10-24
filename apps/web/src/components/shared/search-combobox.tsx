"use client";

import {
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";

import { SearchField } from "@/components/shared/search-field";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function SearchCombobox<T>({
  contentClassName,
  emptyContent = "ไม่พบข้อมูลที่ตรงกับคำค้นหา",
  getItemKey,
  getItemValue,
  hasMore = false,
  isItemDisabled,
  items,
  loadingMore = false,
  onLoadMore,
  onItemSelect,
  onOpenChange,
  open,
  renderItem,
  statusContent,
  onChange,
  onFocus,
  onKeyDown,
  ...inputProps
}: Omit<ComponentProps<typeof SearchField>, "onSelect"> & {
  contentClassName?: string;
  emptyContent?: ReactNode;
  getItemKey: (item: T) => string;
  getItemValue: (item: T) => string;
  hasMore?: boolean;
  isItemDisabled?: (item: T) => boolean;
  items: readonly T[];
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onItemSelect: (item: T) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  renderItem: (item: T) => ReactNode;
  statusContent?: ReactNode;
}) {
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) setActiveIndex(-1);
    onOpenChange(nextOpen);
  };

  const moveActive = (direction: 1 | -1) => {
    const enabledIndices = items.flatMap((item, index) => (isItemDisabled?.(item) ? [] : [index]));
    if (enabledIndices.length === 0) return;
    const currentPosition = enabledIndices.indexOf(activeIndex);
    const nextPosition =
      currentPosition === -1
        ? direction === 1
          ? 0
          : enabledIndices.length - 1
        : (currentPosition + direction + enabledIndices.length) % enabledIndices.length;
    setActiveIndex(enabledIndices[nextPosition] ?? -1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) changeOpen(true);
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      const item = items[activeIndex];
      if (item && !isItemDisabled?.(item)) {
        event.preventDefault();
        onItemSelect(item);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      changeOpen(false);
    }
  };

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || loadingMore || !onLoadMore) return;
    const list = event.currentTarget;
    if (list.scrollHeight - list.scrollTop - list.clientHeight <= 64) onLoadMore();
  };

  return (
    <Popover onOpenChange={changeOpen} open={open}>
      <PopoverAnchor className="block">
        <SearchField
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          onChange={(event) => {
            setActiveIndex(-1);
            onChange?.(event);
          }}
          onFocus={(event) => {
            onFocus?.(event);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          {...inputProps}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={cn(
          "w-[var(--radix-popper-anchor-width)] rounded-none border-border bg-[#15161a] p-0 shadow-2xl",
          contentClassName,
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
        sideOffset={0}
      >
        <Command className="rounded-none" shouldFilter={false}>
          <CommandList id={listId} onScroll={handleListScroll}>
            {statusContent ? (
              <div className="p-4 text-sm text-muted-foreground">{statusContent}</div>
            ) : items.length > 0 ? (
              items.map((item, index) => (
                <CommandItem
                  aria-selected={activeIndex === index}
                  className="rounded-none border-b border-border px-4 py-3 last:border-0 data-[active=true]:bg-surface-elevated data-[selected=true]:bg-surface-elevated"
                  data-active={activeIndex === index}
                  disabled={isItemDisabled?.(item)}
                  id={`${listId}-option-${index}`}
                  key={getItemKey(item)}
                  onSelect={() => onItemSelect(item)}
                  onPointerMove={() => {
                    if (!isItemDisabled?.(item)) setActiveIndex(index);
                  }}
                  value={getItemValue(item)}
                >
                  {renderItem(item)}
                </CommandItem>
              ))
            ) : (
              <CommandEmpty>{emptyContent}</CommandEmpty>
            )}
            {items.length > 0 && loadingMore ? (
              <div
                aria-live="polite"
                className="border-t border-border px-4 py-3 text-center font-label text-xs tracking-[0.1em] text-primary uppercase"
                role="status"
              >
                Loading more…
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
