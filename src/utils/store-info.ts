// Dados fixos da loja (RF23). O texto de antecedência (RF41) ainda será definido com a cliente.
export const STORE = {
  name: 'Jhullymaison',
  whatsappNumber: '5586988627504',
  whatsappDisplay: '(86) 98862-7504',
  instagramHandle: '@jhullymaison',
  instagramUrl: 'https://www.instagram.com/jhullymaison/',
  leadTimeNotice: 'Personalizados precisam de antecedência. Combine o prazo com a loja.',
} as const

export function whatsappUrl(text?: string): string {
  const base = `https://wa.me/${STORE.whatsappNumber}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
