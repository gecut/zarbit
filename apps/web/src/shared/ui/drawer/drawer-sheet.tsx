import type { ReactNode } from "react";

import { Drawer, type DrawerRootProps } from "./drawer";

export type DrawerSheetProps = Omit<DrawerRootProps, "children"> & {
  children: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
};

export function DrawerSheet({
  children,
  title,
  description,
  icon,
  footer,
  snapPoints,
  defaultSnapPoint,
  ...props
}: DrawerSheetProps) {
  return (
    <Drawer.Root
      snapPoints={snapPoints ?? [0.5, 1]}
      defaultSnapPoint={defaultSnapPoint ?? (snapPoints ? undefined : 0.5)}
      snapToSequentialPoints
      swipeDirection="down"
      {...props}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop />

          <Drawer.Viewport>
            <Drawer.Popup>
              <header className="border-separator shrink-0 touch-none select-none border-b px-4 pb-4 sm:px-6">
                <div
                  aria-hidden="true"
                  className="bg-separator mx-auto mt-3 h-1.5 w-12 rounded-full"
                />
                <div className="mt-3 flex items-start gap-3">
                  {icon ? (
                    <span
                      aria-hidden="true"
                      className="bg-accent/12 text-accent grid size-10 shrink-0 place-items-center rounded-2xl"
                    >
                      {icon}
                    </span>
                  ) : null}
                  <div className="min-w-0">
                    <Drawer.Title>{title}</Drawer.Title>
                    {description ? (
                      <Drawer.Description>{description}</Drawer.Description>
                    ) : null}
                  </div>
                </div>
              </header>

              <Drawer.Content>{children}</Drawer.Content>

              {footer ? (
                <footer className="border-separator shrink-0 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom),var(--drawer-keyboard-inset,0px))] pt-4 sm:px-6">
                  {footer}
                </footer>
              ) : null}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
