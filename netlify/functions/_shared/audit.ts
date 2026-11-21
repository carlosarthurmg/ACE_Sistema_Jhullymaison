import type { SupabaseClient } from '@supabase/supabase-js'

/** Registra ação administrativa. Nunca passar dados pessoais em `meta`. */
export async function audit(
  db: SupabaseClient,
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from('admin_audit_logs').insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_safe: meta,
  })
  if (error) console.error('audit_error', error.code)
}
