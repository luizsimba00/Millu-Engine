export class OlistError extends Error {
  constructor(public readonly code: string) {
    super('A integração Olist não pôde concluir a solicitação.');
  }
}
