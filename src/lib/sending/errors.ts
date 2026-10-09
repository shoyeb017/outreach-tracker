export class UncertainSendError extends Error {
  constructor() { super("Microsoft may have accepted this email, but we couldn't confirm the result. Check Sent Items before deliberately sending it again."); this.name = "UncertainSendError"; }
}
