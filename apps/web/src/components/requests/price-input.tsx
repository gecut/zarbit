import { Input } from "@heroui/react";
import { normalizeDigits } from "@zarbit/contracts";

type PriceInputProps = {
  value: string;
  onChange: (value: string) => void;
};

function toDigits(value: string) {
  return normalizeDigits(value).replace(/\D/g, "");
}

export function PriceInput({ value, onChange }: PriceInputProps) {
  const update = (next: string) => {
    const raw = toDigits(next);
    onChange(raw ? new Intl.NumberFormat("en-US").format(Number(raw)) : "");
  };

  return (
    <label>
      <span className="text-foreground mb-[0.55rem] block text-sm font-semibold">
        قیمت هدف
      </span>
      <Input
        aria-describedby="price-hint"
        className="min-h-[3.1rem] w-full text-base"
        dir="ltr"
        inputMode="numeric"
        maxLength={24}
        onChange={(event) => update(event.target.value)}
        placeholder="95,900,000"
        value={value}
      />
      <span id="price-hint" className="text-muted mt-1 block text-xs leading-6">
        قیمت را به ریال وارد کنید.
      </span>
    </label>
  );
}
