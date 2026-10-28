import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Calls an edge function and turns its { error } replies into a plain message.
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string; needsText?: boolean }> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return { data: data as T }
  let message = error.message
  let needsText = false
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json()
      message = payload.error ?? message
      needsText = Boolean(payload.needs_text)
    } catch {
      // keep the generic message
    }
  }
  return { error: message, needsText }
}
