type JoseModule = typeof import("jose");

const nativeImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<JoseModule>;

let josePromise: Promise<JoseModule> | undefined;

export function loadJose(): Promise<JoseModule> {
  josePromise ??= nativeImport("jose");
  return josePromise;
}
