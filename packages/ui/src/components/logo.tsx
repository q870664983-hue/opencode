import { ComponentProps } from "solid-js"
import sinecodeMark from "../assets/branding/sinecode-mark.png"

type ImageProps = Pick<ComponentProps<"img">, "class" | "style" | "ref">

export const Mark = (props: ImageProps) => {
  return (
    <img
      ref={props.ref}
      src={sinecodeMark}
      alt=""
      aria-hidden="true"
      data-component="logo-mark"
      class={props.class}
      style={props.style}
      draggable={false}
    />
  )
}

export const Splash = (props: ImageProps) => {
  return (
    <img
      ref={props.ref}
      src={sinecodeMark}
      alt=""
      aria-hidden="true"
      data-component="logo-splash"
      class={props.class}
      style={props.style}
      draggable={false}
    />
  )
}

export const Logo = (props: { class?: string; style?: ComponentProps<"div">["style"] }) => {
  return (
    <div class={props.class} style={props.style} data-component="logo-wordmark">
      <div class="inline-flex items-center gap-4">
        <Mark class="w-10 h-10 shrink-0 rounded-[12px]" />
        <div
          class="text-[31px] leading-none font-semibold tracking-[-0.05em] text-text-strong"
          style={{ "font-family": "Avenir Next, Helvetica Neue, sans-serif" }}
        >
          SineCode
        </div>
      </div>
    </div>
  )
}
