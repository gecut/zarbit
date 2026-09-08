import { Button, Card } from "@heroui/react";
import { useState } from "react";
import { Sun2Icon, MoonIcon } from "@solar-icons/react/linear";

import {
  applyTheme,
  getThemePreference,
  saveThemePreference,
  type Theme,
} from "../../shared/theme/theme";
import { Icon } from "@solar-icons/react/lib/types";

const themeOptions = [
  ["light", "روشن", Sun2Icon],
  ["dark", "تیره", MoonIcon],
] as const satisfies ReadonlyArray<readonly [Theme, string, Icon]>;

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(getThemePreference);

  return (
    <section>
      <Card variant="default">
        <Card.Header className="flex items-start justify-between gap-4 p-0">
          <div>
            <Card.Title className="text-sm">ظاهر برنامه</Card.Title>
            <Card.Description className="mt-1 text-xs leading-6">
              تم دلخواه را برای این دستگاه انتخاب کنید.
            </Card.Description>
          </div>
        </Card.Header>
        <div
          aria-label="تم برنامه"
          className="mt-4 grid grid-cols-2 gap-2"
          role="group"
        >
          {themeOptions.map(([value, label, Icon]) => (
            <Button
              aria-pressed={theme === value}
              className="h-auto p-4 text-xs font-semibold"
              fullWidth
              key={value}
              onPress={() => {
                setTheme(value);
                applyTheme(value);
                saveThemePreference(value);
              }}
              size="sm"
              variant={value === theme ? "primary" : "secondary"}
            >
              <div className="flex flex-col gap-2">
                <Icon className="size-8" />

                {label}
              </div>
            </Button>
          ))}
        </div>
      </Card>
    </section>
  );
}
