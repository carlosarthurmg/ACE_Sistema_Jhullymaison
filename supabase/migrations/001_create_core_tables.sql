-- 001_create_core_tables.sql
-- Núcleo do sistema: tipos, sequência do código do pedido, perfis, endereços,
-- sessões do cookie e auditoria de recuperação de senha.
--
-- COMO RODAR: no SQL Editor do SEU projeto Supabase, execute 001 a 006 em ordem.
-- NUNCA altere o banco "na mão". Toda mudança vira um novo arquivo numerado.
-- Base: Guia (Apêndice E) + Adendo 1 v1.1 (seções 4 e 5).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Tipos ----------
CREATE TYPE public.user_role AS ENUM ('customer', 'admin');

CREATE TYPE public.order_status AS ENUM (
  'awaiting_payment', 'preparing', 'ready_for_pickup',
  'shipped', 'delivered', 'cancelled'
);

CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'cancelled');

CREATE TYPE public.payment_method AS ENUM (
  'pix', 'cash_on_delivery', 'card_on_delivery'
);

CREATE TYPE public.fulfillment_type AS ENUM ('delivery', 'pickup');

CREATE TYPE public.notification_status AS ENUM ('pending', 'sent', 'failed');

-- ---------- Sequência do código do pedido (JM-0001, JM-0002...) ----------
CREATE SEQUENCE public.order_code_seq START 1;

-- ---------- Perfis (complementa auth.users do Supabase Auth) ----------
-- E-mail e senha ficam no Supabase Auth. Aqui ficam os dados do sistema.
-- Anonimização (RF42/RN20): full_name = 'Cliente removido', phone = '' e
-- anonymized_at preenchido; os pedidos continuam, sem identificar o cliente.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'customer',
  accepted_terms_at TIMESTAMPTZ NOT NULL,
  accepted_terms_version TEXT NOT NULL,
  anonymized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT,
  recipient_name TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_customer_idx ON public.customer_addresses(customer_id);
-- No máximo um endereço padrão por cliente.
CREATE UNIQUE INDEX customer_addresses_one_default_idx
  ON public.customer_addresses(customer_id) WHERE is_default;

-- ---------- Sessões do cookie (Guia, Apêndice D) ----------
-- Só as Functions (service role) leem e escrevem. Sem policy para o navegador.
CREATE TABLE public.app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  encrypted_session TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX app_sessions_user_id_idx ON public.app_sessions(user_id);
CREATE INDEX app_sessions_expires_at_idx ON public.app_sessions(expires_at);

-- ---------- Auditoria mínima da recuperação de senha ----------
-- NUNCA guardar o token aqui. outcome sugerido: 'requested', 'completed', 'expired'.
CREATE TABLE public.password_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  outcome TEXT NOT NULL DEFAULT 'requested'
);
CREATE INDEX password_reset_audit_user_idx ON public.password_reset_audit(user_id);
