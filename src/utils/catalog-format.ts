// Formatação usada pelas telas do catálogo. Se o projeto já tiver um formatBRL central, use o central.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatBRL = (value: number): string => brl.format(value)

// Datas de promoção sempre no fuso de Fortaleza (UTC-3, sem horário de verão).
export const dayStartIso = (day: string): string => `${day}T00:00:00-03:00`
export const dayEndIso = (day: string): string => `${day}T23:59:59-03:00`
export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })
