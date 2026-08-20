/**
 * @napi-rs/canvas ships geometry.js as an untyped, vendored pure-JavaScript geometry polyfill.
 * pdf-navigation.ts loads it deliberately -- it is the one part of that package that works without
 * the compiled native binding, which is absent from the deployed bundle.
 *
 * Only the constructors actually installed as globals are declared. Anything else stays untyped on
 * purpose: this is a narrow shim for one import, not a type definition for the package.
 */
declare module '@napi-rs/canvas/geometry.js' {
  export class DOMMatrix {
    constructor(init?: number[] | string);
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  }
  export class DOMPoint {
    constructor(x?: number, y?: number, z?: number, w?: number);
    x: number;
    y: number;
    z: number;
    w: number;
  }
  export class DOMRect {
    constructor(x?: number, y?: number, width?: number, height?: number);
    x: number;
    y: number;
    width: number;
    height: number;
  }
}
