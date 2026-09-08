/* eslint-disable react-refresh/only-export-components -- one intentional Base UI adapter surface */

import {
  Drawer as BaseDrawer,
  type DrawerBackdropProps,
  type DrawerCloseProps,
  type DrawerContentProps,
  type DrawerDescriptionProps,
  type DrawerIndentBackgroundProps,
  type DrawerIndentProps,
  type DrawerPopupProps,
  type DrawerPortalProps,
  type DrawerRootProps,
  type DrawerSwipeAreaProps,
  type DrawerTitleProps,
  type DrawerTriggerProps,
  type DrawerViewportProps,
  type DrawerVirtualKeyboardProviderProps,
} from "@base-ui/react/drawer";
import { cn } from "@heroui/styles";
import type { Ref } from "react";

function Backdrop(props: DrawerBackdropProps) {
  return (
    <BaseDrawer.Backdrop
      {...props}
      className={cn(
        "zarbit-drawer-backdrop z-60 bg-black/50 backdrop-blur-xs opacity-(--drawer-swipe-progress) fixed inset-0 min-h-dvh",
        "transition-opacity duration-500",
        "[data-starting-style]:opacity-0 [data-ending-style]:opacity-0 [data-swiping]:duration-0 [data-ending-style]:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
        props.className,
      )}
    />
  );
}

function Viewport(props: DrawerViewportProps) {
  return (
    <BaseDrawer.Viewport
      {...props}
      className={cn(
        "z-60 fixed inset-0 flex touch-none items-end justify-center overflow-hidden p-0 sm:p-4",
        props.className,
      )}
    />
  );
}

function Popup(props: DrawerPopupProps) {
  return (
    <BaseDrawer.Popup
      {...props}
      className={cn(
        "zarbit-drawer-popup border-border bg-surface text-foreground shadow-surface z-1 max-w-124 rounded-t-4xl sm:rounded-4xl relative flex min-h-0 w-full flex-col border-t outline-none sm:border",
        "max-h-[calc(100vh-5.5rem)]",
        props.className,
      )}
    />
  );
}

function Content(props: DrawerContentProps) {
  return (
    <BaseDrawer.Content
      {...props}
      className={cn(
        "min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-4 py-5 sm:px-6",
        props.className,
      )}
    />
  );
}

function Title(props: DrawerTitleProps) {
  return (
    <BaseDrawer.Title
      {...props}
      className={cn("text-foreground text-xl font-bold", props.className)}
    />
  );
}

function Description(props: DrawerDescriptionProps) {
  return (
    <BaseDrawer.Description
      {...props}
      className={cn("text-muted mt-1 text-sm leading-6", props.className)}
    />
  );
}

function Close(props: DrawerCloseProps) {
  return (
    <BaseDrawer.Close
      {...props}
      className={cn(
        "border-border bg-surface-secondary text-foreground hover:bg-surface-tertiary focus-visible:outline-3 focus-visible:outline-focus inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-[background-color,transform] focus-visible:outline-offset-2 active:scale-95",
        props.className,
      )}
    />
  );
}

function Trigger<Payload>(
  props: DrawerTriggerProps<Payload> & { ref?: Ref<HTMLElement> },
) {
  return (
    <BaseDrawer.Trigger
      {...props}
      className={cn(
        "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2",
        props.className,
      )}
    />
  );
}

function SwipeArea(props: DrawerSwipeAreaProps) {
  return <BaseDrawer.SwipeArea {...props} />;
}

function Indent(props: DrawerIndentProps) {
  return <BaseDrawer.Indent {...props} />;
}

function IndentBackground(props: DrawerIndentBackgroundProps) {
  return <BaseDrawer.IndentBackground {...props} />;
}

function Portal(props: DrawerPortalProps & { ref?: Ref<HTMLDivElement> }) {
  return <BaseDrawer.Portal {...props} />;
}

function Root<Payload>(props: DrawerRootProps<Payload>) {
  return <BaseDrawer.Root {...props} />;
}

function Provider(props: { children?: React.ReactNode }) {
  return <BaseDrawer.Provider {...props} />;
}

function VirtualKeyboardProvider(props: DrawerVirtualKeyboardProviderProps) {
  return <BaseDrawer.VirtualKeyboardProvider {...props} />;
}

export const Drawer = {
  Provider,
  IndentBackground,
  Indent,
  Root,
  Trigger,
  SwipeArea,
  VirtualKeyboardProvider,
  Portal,
  Backdrop,
  Viewport,
  Popup,
  Content,
  Title,
  Description,
  Close,
  createHandle: BaseDrawer.createHandle,
};

export type {
  DrawerBackdropProps,
  DrawerCloseProps,
  DrawerContentProps,
  DrawerDescriptionProps,
  DrawerIndentBackgroundProps,
  DrawerIndentProps,
  DrawerPopupProps,
  DrawerPortalProps,
  DrawerRootProps,
  DrawerSwipeAreaProps,
  DrawerTitleProps,
  DrawerTriggerProps,
  DrawerViewportProps,
  DrawerVirtualKeyboardProviderProps,
};
