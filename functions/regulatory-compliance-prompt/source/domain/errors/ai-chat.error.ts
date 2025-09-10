export class AIChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIChatError";
  }
}

export class MaxRequestsError extends AIChatError {
  constructor(message: string = "Max requests exceeded, try again later") {
    super(message);
    this.name = "MaxRequestsError";
  }
}
