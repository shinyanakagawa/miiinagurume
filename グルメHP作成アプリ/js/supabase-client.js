// ============================================================
// グルメHP作成アプリ - Supabase クライアント
// 既存チームDBと同じSupabaseプロジェクトを利用（テーブルのみ追加）
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = 'https://fgwoqrnjrsnnhogxvtof.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CmlWeDTHmnnyCQZ2luPqxg_1g5NdBsU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 認証 ----------------------------------------------------

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// ---- サイト ---------------------------------------------------

/** ログインユーザーのサイト一覧を取得 */
export async function getMySites() {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** サイトを1件取得（自分のサイト編集用） */
export async function getSiteById(id) {
  const { data, error } = await supabase.from('sites').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** スラッグから公開サイトを取得（公開ページ表示用・誰でも可） */
export async function getPublishedSiteBySlug(slug) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  if (error) throw error;
  return data;
}

/** スラッグの重複チェック */
export async function isSlugTaken(slug) {
  const { data, error } = await supabase.from('sites').select('id').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return !!data;
}

/** 新規サイト作成 */
export async function createSite({ slug, theme, data }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('ログインが必要です');
  const { data: row, error } = await supabase
    .from('sites')
    .insert([{ user_id: user.id, slug, theme, data, status: 'draft' }])
    .select()
    .single();
  if (error) throw error;
  return row;
}

/** サイト内容を更新 */
export async function updateSiteData(id, { theme, data, status }) {
  const patch = {};
  if (theme !== undefined) patch.theme = theme;
  if (data !== undefined) patch.data = data;
  if (status !== undefined) patch.status = status;
  const { data: row, error } = await supabase.from('sites').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return row;
}

/** サイト削除 */
export async function deleteSite(id) {
  const { error } = await supabase.from('sites').delete().eq('id', id);
  if (error) throw error;
}

// ---- 写真アップロード ------------------------------------------

/**
 * 写真をStorageにアップロードし、公開URLを返す
 * @param {File} file
 * @returns {Promise<string>} 公開URL
 */
export async function uploadSiteImage(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error('ログインが必要です');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('site-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('site-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---- 課金（Edge Functions経由） --------------------------------

/** Stripe Checkoutセッションを作成し、決済ページURLを返す */
export async function createCheckoutSession(siteId) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ siteId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { url }
}
