export type LoadFailure = 'encrypted' | 'damaged' | 'unsupported';

export class TelemetryLoadError extends Error {
  readonly kind: LoadFailure;
  constructor(kind: LoadFailure) {
    super(kind);
    this.kind = kind;
  }
}
