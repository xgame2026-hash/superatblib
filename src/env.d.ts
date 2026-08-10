/// <reference types="vite/client" />

declare const __APP_GIT_COMMIT__: string;

declare module "three-vanta" {
  export * from "three";
}

declare module "vanta/dist/vanta.waves.min" {
  type VantaWavesOptions = {
    el: HTMLElement;
    THREE: typeof import("three-vanta");
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    color?: number;
    shininess?: number;
    waveHeight?: number;
    waveSpeed?: number;
    zoom?: number;
  };

  export default function WAVES(options: VantaWavesOptions): unknown;
}
