/** A credential-safe YouTube diagnostic that may be displayed by the CLI. */
export class YouTubeError extends Error {
  readonly accountFatal: boolean;

  constructor(message?: string, options?: ErrorOptions & { accountFatal?: boolean }) {
    super(message, options);
    this.accountFatal = options?.accountFatal ?? false;
  }
}
