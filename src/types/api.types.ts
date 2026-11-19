// Padrão de resposta da API (Guia, seção 6.1).
export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiErrorBody | null;
}
