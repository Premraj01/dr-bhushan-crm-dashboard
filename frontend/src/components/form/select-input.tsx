import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check, Search } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((n) => (typeof n === "string" || typeof n === "number" ? String(n) : ""))
    .join("");

/** Reads `<option>` children (also inside arrays and fragments) the way a `<select>` would. */
function optionsFrom(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      out.push(...optionsFrom((child as ReactElement<{ children?: ReactNode }>).props.children));
      return;
    }
    if (child.type !== "option") return;
    const { value, children: label, disabled } = (child as ReactElement<OptionProps>).props;
    const text = textOf(label);
    out.push({ value: value != null ? String(value) : text, label: text, disabled: !!disabled });
  });
  return out;
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "children"
> & {
  value: string | number;
  /** Same shape as a `<select>` change, so `e.target.value` handlers work unchanged. */
  onChange: (e: { target: { value: string } }) => void;
  /** `<option>` elements, as in a `<select>`… */
  children?: ReactNode;
  /** …or the options as data. */
  options?: SelectOption[];
  /** Shows the search box; on by default. */
  searchable?: boolean;
  popoverClassName?: string;
};

/**
 * A `<select>` replacement with a searchable menu in the app's theme — native
 * select menus are drawn by the OS and can't be styled or searched.
 */
export function SelectInput({
  value,
  onChange,
  children,
  options: given,
  searchable = true,
  className,
  popoverClassName,
  disabled,
  required,
  placeholder,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const options = given ?? optionsFrom(children);
  const current = String(value);
  const selected = options.find((o) => o.value === current);
  // A required select left on its "" option shows that option as a placeholder,
  // so validation sees it as empty.
  const empty = current === "" && required;
  const shown = empty ? "" : (selected?.label ?? current);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() =>
      listRef.current?.querySelector("[data-current=true]")?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(id);
  }, [open]);

  const choose = (next: string) => {
    if (next !== current) onChange({ target: { value: next } });
    setOpen(false);
  };

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <input
          {...props}
          type="text"
          readOnly
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          data-validate="select"
          required={required}
          disabled={disabled}
          className={cn("select-trigger", className)}
          value={shown}
          placeholder={placeholder ?? (empty ? selected?.label : undefined) ?? "Select"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            } else if (searchable && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
              // Typing on the closed field starts a search.
              e.preventDefault();
              setSearch(e.key);
              setOpen(true);
            }
            props.onKeyDown?.(e);
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("picker-popover select-popover p-0", popoverClassName)}
        onOpenAutoFocus={(e) => {
          if (!searchable) {
            e.preventDefault();
            listRef.current?.focus();
          }
        }}
      >
        <CommandPrimitive
          className="select-command"
          loop
          filter={(itemValue, query) =>
            itemValue.split("\u0000")[0]!.toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0
          }
          {...(selected && { defaultValue: `${selected.label}\u0000${selected.value}` })}
        >
          {searchable && (
            <div className="select-search">
              <Search aria-hidden="true" />
              <CommandPrimitive.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search…"
              />
            </div>
          )}
          <CommandPrimitive.List ref={listRef} className="select-list" tabIndex={-1}>
            <CommandPrimitive.Empty className="select-empty">No matches</CommandPrimitive.Empty>
            {/* A required select's "" option is only its placeholder, not a choice. */}
            {options
              .filter((o) => !(required && o.value === ""))
              .map((o) => (
                <CommandPrimitive.Item
                  key={o.value}
                  // Label first so search matches what's shown; value keeps items unique.
                  value={`${o.label}\u0000${o.value}`}
                  keywords={[o.label]}
                  disabled={!!o.disabled}
                  data-current={o.value === current}
                  onSelect={() => choose(o.value)}
                  className="select-option"
                >
                  <span>{o.label}</span>
                  {o.value === current && <Check aria-hidden="true" />}
                </CommandPrimitive.Item>
              ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
